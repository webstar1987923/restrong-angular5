import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from "rxjs/Rx";

// Shared Helpers
import { Util } from '../../../../shared/util';
import { Constants } from '../../../../shared/constants';

// Shared Models
import { MenuItem } from '../../../../shared/models/menu-item';
import { QueryParams } from '../../../../shared/models/query-params';
import { SearchMenuAPIRequestData } from '../../../../shared/models/search-menu-api-request-data';

// Shared Services
import { AppService } from '../../../../shared/services/app.service';
import { EventsService } from '../../../../shared/services/events.service';
import { BaseModal } from '../../../../shared/services/base-modal.service';
import { ToastsManager } from "ng2-toastr/ng2-toastr";
import { ShoppingCart } from "../../services/shopping-cart.service";

import * as _ from "lodash";
import { SharedDataService } from '../../../../shared/services/shared-data.service';
import { UserAPIRequestData } from '../../../../shared/models/user-api-request-data';
import { Observable } from 'rxjs/Observable';
import { UserService } from '../../services/user.service';
import { SoldOutActionAPIRequestData } from '../../../../shared/models/soldout-action-api-request-data';
import { HelperService } from '../../../../shared/services/helper.service';

@Component({
	selector: 'menu-item-options-modal',
	templateUrl: './menu-item-options-modal.component.html',
})
export class MenuItemOptionsModalComponent extends BaseModal {
	LOG_TAG = 'MenuItemOptionsModalComponent1';

	totalPrice = 0;
	selectedMenuItem = new MenuItem();

	selectedSoldOutAction: any;
	soldOutActions = new Array<any>();

	busy: boolean;
	busySoldOutAction: boolean;

	customDeliveryFee: any = null;

	public get isRestOpen() : boolean {
        return this.selectedMenuItem && this.helperService.isBetweenUTCTime(this.selectedMenuItem.UTC_OpeningTime, this.selectedMenuItem.UTC_ClosingTime);
	}
	
	@Output() modalEvents: EventEmitter<any> = new EventEmitter<any>();

	@ViewChild('modal') public modal: any;
	constructor(public eventsService: EventsService, private route: ActivatedRoute, public constants: Constants, public appService: AppService, public shoppingCart: ShoppingCart, private toastr: ToastsManager, public sharedDataService: SharedDataService, public userService: UserService, private helperService: HelperService) {
		super(eventsService);
	}

	open = (menuItem: MenuItem) => {
		Util.log(this.LOG_TAG, 'open', menuItem);

		this.selectedMenuItem = _.clone(menuItem);
		this.selectedMenuItem.quantity = 1;
		this.updateTotalPrice();

		this.openModal();

		this.busy = true;
		var promiseList = [];

		// Load App Settings
		promiseList.push(this.appService.getAppSettings(new UserAPIRequestData()));

		if (this.selectedMenuItem.DeliveryModeID == this.constants.DELIVERY_MODE_SCHLEP_FETCH) {
			var requestData = new SearchMenuAPIRequestData();
			requestData.coordinate = '';
			requestData.restaurantid = this.selectedMenuItem.RestaurantID;

			promiseList.push(this.appService.getDeliveryFee(requestData));
		}

		Observable.forkJoin(promiseList)
			.subscribe((responseList) => {
				var i = 0;

				var appSettingsResponse: any = responseList[i++];
				this.soldOutActions = appSettingsResponse.SoldOutActions;

				if (this.userService.isLoggedIn) {
					var userSoldOutAction = this.userService.loginUser.SoldOutAction;

					if (Util.isDefined(userSoldOutAction)) {
						var temp = this.soldOutActions.filter(s => s.ID == userSoldOutAction.ID);

						if (temp.length > 0) {
							var item = temp[0];

							this.selectedSoldOutAction = item;
						}
					}
				}
				else {
					if (this.soldOutActions.length > 0) {
						this.selectedSoldOutAction = this.soldOutActions[0];
					}
				}

				if (this.selectedMenuItem.DeliveryModeID == this.constants.DELIVERY_MODE_SCHLEP_FETCH) {
					var restDeliveryFeeList = responseList[i++];

					var restID = this.selectedMenuItem.RestaurantID;
					var foundRestDeliveryFee = null;

					if (Util.isDefined(restDeliveryFeeList)) {
						for (var restDeliveryFeeIndex in restDeliveryFeeList) {
							var restDeliveryFee = restDeliveryFeeList[restDeliveryFeeIndex];

							if (restDeliveryFee.RestaurantID == restID) {
								foundRestDeliveryFee = restDeliveryFee;
								this.customDeliveryFee = foundRestDeliveryFee;
								break;
							}
						}
					}
				}

				this.busy = false;

				this.loadData();
			});
	}

	loadData = () => {
		if (!this.selectedMenuItem.IsSingleSize) {
			this.busy = true;

			var requestData = new SearchMenuAPIRequestData();

			requestData.menuitemid = this.selectedMenuItem.MenuItemID;
			requestData.Menus_SourceID = this.selectedMenuItem.Menus_SourceID;

			this.appService.getMenuItemSizes(requestData)
				.subscribe(response => {
					this.selectedMenuItem.menuItemSizes = response.Data;
					this.busy = false;

					for (var i in this.selectedMenuItem.menuItemSizes) {
						var item = this.selectedMenuItem.menuItemSizes[i];
						if (item.Is_Default) {
							this.selectMenuItemSize(item);
							break;
						}
					}

				});
		}
		else {
			this.selectedMenuItem.menuItemSizes = [];
			this.selectMenuItemSize(null);
		}
	}

	selectMenuItemSize = (menuItemSize) => {
		if (this.busy) return;

		this.busy = true;
		this.selectedMenuItem.menuItemOptions = [];

		var zid = null;

		if (menuItemSize) {
			this.selectedMenuItem.selectedMenuItemSize = menuItemSize;

			zid = this.selectedMenuItem.selectedMenuItemSize.id;
		}

		var requestData = new SearchMenuAPIRequestData();

		requestData.Menus_SourceID = this.selectedMenuItem.Menus_SourceID;
		requestData.option = 0;
		requestData.menuitemid = this.selectedMenuItem.MenuItemID;
		requestData.zid = zid;

		this.appService.getMenuItemOptions(requestData)
			.subscribe(response => {
				this.selectedMenuItem.menuItemOptions = Util.clone(response.MenuOptions);
				this.busy = false;

				for (var i in this.selectedMenuItem.menuItemOptions) {
					var item = this.selectedMenuItem.menuItemOptions[i];
					for (var j in item.OptionItems) {
						var optionItem = item.OptionItems[j];

						if (optionItem.Is_Default) {
							this.selectMenuItemOptionItem(optionItem, item);
							if (item.Is_Single_Select) break;
						}
					}
				}

				this.updateTotalPrice();
			});
	};

	selectMenuItemOptionItem = (optionItem, menuItemOption) => {
		if (menuItemOption.Is_Single_Select) {
			// Single select
			menuItemOption.selectedOptionItem = optionItem;
		}
		else if (!menuItemOption.Is_Single_Select) {
			// Multiple select
			optionItem.isSelected = !optionItem.isSelected;

			if (optionItem.isSelected) {
				if (typeof menuItemOption.totalSelectedOptionItems === 'undefined' || !menuItemOption.totalSelectedOptionItems)
					menuItemOption.totalSelectedOptionItems = 0;

				// Maximum limit
				if (menuItemOption.Maximum_Select > 1 && menuItemOption.totalSelectedOptionItems == menuItemOption.Maximum_Select) {
					optionItem.isSelected = false;
					this.toastr.error(`You can't add more option items.`, `Maximum limit reached`);
					return;
				}
				menuItemOption.totalSelectedOptionItems++;
			}
			else {
				menuItemOption.totalSelectedOptionItems--;
			}
		}

		this.updateTotalPrice();
	}

	onSoldOutActionChanged = () => {
		Util.log(this.LOG_TAG, 'onSoldOutActionChanged', this.selectedSoldOutAction);

		this.busySoldOutAction = true;

		var requestData = new SoldOutActionAPIRequestData();
		requestData.a = this.selectedSoldOutAction.ID;

		this.appService.updateSoldOutAction(requestData)
			.subscribe(response => {

				if (Util.isDefined(response) && Util.isDefined(response.Code)) {
					if (response.Code == 'CUSTOMER_SETTINGS_UPDATED') {
						if (this.userService.isLoggedIn) {
							this.userService.loginUser.SoldOutAction = this.selectedSoldOutAction;
						}

						this.toastr.success('Successfully updated Sold Out Action.', 'Success!');
					}
				}

				this.busySoldOutAction = false;

				Util.log(this.LOG_TAG, 'setDefaultUserAddress()', response);
			});
	}

	addToCart = async () => {
		this.busy = true;
		var isValid = true;
		var menuItem = this.selectedMenuItem;

		// Checks if menu item size is availble and user has choosen atleast 1 size
		if (menuItem.menuItemSizes.length > 0 && ((typeof menuItem.selectedMenuItemSize === 'undefined' || !menuItem.selectedMenuItemSize))) {
			isValid = false;
			this.toastr.error('You need to choose atleast 1 option', 'Choose item size');
		}
		else {
			// Checks the validation rules on the option items of a particular menu item
			for (var i in menuItem.menuItemOptions) {
				var menuItemOption = menuItem.menuItemOptions[i];

				// For single select items
				if (menuItemOption.Is_Single_Select) {
					if (typeof menuItemOption.selectedOptionItem === 'undefined' || !menuItemOption.selectedOptionItem) {
						isValid = false;
						this.toastr.error('You need to choose atleast 1 option', menuItemOption.OptionHeader);
						break;
					}
				}
				else {
					// For multi select items
					var totalSelectedOptionItems = menuItemOption.totalSelectedOptionItems || 0;
					if (totalSelectedOptionItems < menuItemOption.Minimum_Select) {
						isValid = false;
						this.toastr.error('You need to choose atleast ' + menuItemOption.Minimum_Select + ' option', menuItemOption.OptionHeader);
						break;
					}
				}

			}
		}

		// If user selected valid options, then update the cart
		if (isValid) {
			await this.shoppingCart.addMenuItem(this.selectedMenuItem, this.customDeliveryFee);
			this.close();
		}

		this.busy = false;
	}

	updateQty = (increment) => {

		var newQty = (increment + this.selectedMenuItem.quantity);

		if ((increment + this.selectedMenuItem.quantity) > this.constants.CART_ITEM_MAX_LIMIT) {
			this.toastr.error(`You can't add more then ${this.constants.CART_ITEM_MAX_LIMIT} items`, 'Error!');
		}
		else {
			if (newQty < 1) newQty = 1;

			this.selectedMenuItem.quantity = newQty;
			this.updateTotalPrice();
		}

	};

	updateTotalPrice = () => {
		this.totalPrice = ShoppingCart.calculateMenuItemTotalPrice(this.selectedMenuItem);
	}

	close = () => {
		this.closeModal();
	}

}
