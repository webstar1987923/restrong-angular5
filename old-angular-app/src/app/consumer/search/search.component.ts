import { Component, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

// Shared Helpers
import { Util } from '../../shared/util';
import { Constants } from '../../shared/constants';

// Shared Models
import { QueryParams } from '../../shared/models/query-params';
import { SearchMenuAPIRequestData } from '../../shared/models/search-menu-api-request-data';

// Shared Services
import { AppService } from '../../shared/services/app.service';
import { EventsService } from '../../shared/services/events.service';
import { SharedDataService } from '../../shared/services/shared-data.service';

// Shared Components
import { FiltersComponent } from '../shared/components/filters/filters.component';

@Component({
    selector: 'cr-search',
    templateUrl: './search.component.html',
    providers: []
})
export class SearchComponent {
    LOG_TAG = 'search-page =>';

    routeSubscription: any;

    queryParams = new QueryParams();

    // Dishes
    pageDish: number;
    busyDish = false;
    hasMoreDishes: boolean;
    dishNoResults: boolean;
    defaultDishNoResultConfig = {
        icon: 'burger-search-fail-icon',
        title: "We can't find dishes",
        subtitle: 'Try to change your filters or search for something else.'
    };
    dishNoResultConfig: any;
    dishes: any = [];
    dishRequestData = new SearchMenuAPIRequestData();
    dishAvailableServiceTypes: any;
    dishAvailableServiceTypesCount: number;

    // Restaurants
    pageRest: number;
    busyRest = false;
    hasMoreRest: boolean;
    restNoResults: boolean;
    defaultRestNoResultConfig = {
        icon: 'restaurant-menu-icon',
        title: "We can't find restaurants",
        subtitle: 'Try to change your filters or search for something else.'
    };
    restNoResultConfig: any;
    restaurants: any = [];
    restRequestData = new SearchMenuAPIRequestData();
    restAvailableServiceTypes: any;
    restAvailableServiceTypesCount: number;

    @ViewChild('filtersComponent') public filtersComponent: FiltersComponent;

    constructor(public constants: Constants, public appService: AppService, public sharedDataService: SharedDataService, private route: ActivatedRoute, private router: Router, public eventsService: EventsService) {
        Util.log('search-page => constructor()');

        this.routeSubscription = this.route.queryParams.subscribe((params: any) => {
            // Get selected tab
            Util.log('search-page => QueryParams', params);

            QueryParams.fillParams(this.queryParams, params);

            this.initPage();
        });

        // Listen to `user location changed` event
        this.eventsService.onUserLocationChanged.subscribe((googlePlace) => {
            this.initPage();

            Util.log(this.LOG_TAG, 'UserLocationChanged()');
        });

        // TODO: Convert query params to Slug params according to SEO requirments 
        // this.route.params.forEach((p) => {
        //   Util.log('slug params', p['id']);
        // });    
    }

    initPage() {
        Util.log('search-page => universalInit()');

        this.loadData();
    }

    loadData = () => {
        if (this.sharedDataService.viewMode == this.constants.VIEW_MODE_DISH) {
            this.initDishes();
            this.loadDishes();
        }
        else if (this.sharedDataService.viewMode == this.constants.VIEW_MODE_RESTAURANT) {
            this.initRest();
            this.loadRestaurants();
        }
    }

    initDishes = () => {
        this.pageDish = 1;
        this.hasMoreDishes = true;
        this.dishNoResults = false;
        this.dishNoResultConfig = Util.clone(this.defaultDishNoResultConfig);
    }

    loadDishes = (loadMore?) => {
        if (this.hasMoreDishes && !this.busyDish) {
            Util.log('search-page => loadDishes()', this.pageDish);

            this.busyDish = true;

            var requestData = new SearchMenuAPIRequestData();

            SearchMenuAPIRequestData.fillQueryParams(requestData, this.queryParams);
            SearchMenuAPIRequestData.fillSharedData(requestData, this.sharedDataService);

            this.dishRequestData = Util.clone(requestData); // Keep a copy of last `request data` sent to server

            Util.log(this.LOG_TAG, 'dishRequestData', this.dishRequestData);

            requestData.page = loadMore ? this.pageDish++ : 1;
            requestData.pageSize = 20;

            if (requestData.page == 1)
                this.dishes = [];

            this.appService.searchDish(requestData).subscribe(response => {
                this.hasMoreDishes = response.Data && response.Data.length;

                if (this.hasMoreDishes) {
                    this.dishes = this.dishes.concat(response.Data);
                    this.busyDish = false;
                }
                else {
                    if (requestData.page == 1) {
                        this.loadDishAvailableServiceTypes(requestData);
                    }
                    else {
                        this.busyDish = false;
                    }
                }

                Util.log('dishes', this.dishes, this.busyDish);
            });
        }
        else {
            Util.log('No Request sent', this.hasMoreDishes, this.busyDish);
        }
    }

    loadDishAvailableServiceTypes = (request) => {
        var newRequest = Util.clone(request);
        newRequest.option = 1;

        this.appService.getAvailableServiceTypes(newRequest)
            .subscribe(response => {

                this.dishNoResultConfig = {
                    icon: 'burger-search-fail-icon',
                    title: "We can't find dishes for " + this.sharedDataService.serviceType + " service.",
                    subtitle: 'But we found results in other serivce types.',
                    buttons: []
                }

                this.dishAvailableServiceTypes = {};
                this.dishAvailableServiceTypesCount = 0;

                var availableServiceTypes = response.Table;

                for (var i in availableServiceTypes) {
                    var availableServiceType = availableServiceTypes[i];

                    if (availableServiceType.isExist) {
                        var button = {
                            title: this.constants.SERVICE_TYPE_TITLE[availableServiceType.MenuType],
                            type: 'service-type',
                            action: ((serviceType) => {
                                return () => {
                                    this.filtersComponent.canChangeServiceType(serviceType);

                                    Util.log('Change service type', serviceType);
                                }
                            })(this.constants.SERVICE_TYPE_TITLE[availableServiceType.MenuType])
                        };

                        this.dishNoResultConfig.buttons.push(button);

                        this.dishAvailableServiceTypesCount++
                    }
                }

                if (this.dishAvailableServiceTypesCount == 0) {
                    this.dishNoResultConfig = Util.clone(this.defaultDishNoResultConfig);
                }

                Util.log('getAvailableServiceTypes', this.dishAvailableServiceTypes);
                this.dishNoResults = true;
                this.busyDish = false;
            });
    };

    initRest = () => {
        this.pageRest = 1;
        this.hasMoreRest = true;
        this.restNoResults = false;
        this.restNoResultConfig = Util.clone(this.defaultRestNoResultConfig);
    }

    loadRestaurants = (loadMore?) => {
        if (this.hasMoreRest && !this.busyRest) {
            Util.log('search-page => loadRestaurants()', this.pageRest);

            this.busyRest = true;

            var requestData = new SearchMenuAPIRequestData();

            SearchMenuAPIRequestData.fillQueryParams(requestData, this.queryParams);
            SearchMenuAPIRequestData.fillSharedData(requestData, this.sharedDataService);

            this.restRequestData = Util.clone(requestData); // Keep a copy of last `request data` sent to server

            Util.log(this.LOG_TAG, 'restRequestData', this.restRequestData);

            requestData.page = loadMore ? this.pageRest++ : 1;
            requestData.pageSize = 20;

            if (requestData.page == 1)
                this.restaurants = [];

            this.appService.searchRestaurant(requestData).subscribe(response => {
                this.hasMoreRest = response.Data && response.Data.length;

                if (this.hasMoreRest) {
                    this.restaurants = this.restaurants.concat(response.Data);
                    this.busyRest = false;
                }
                else {
                    if (requestData.page == 1) {
                        this.loadRestAvailableServiceTypes(requestData);
                    }
                    else {
                        this.busyRest = false;
                    }
                }

                Util.log('restaurants', this.restaurants);
            });
        }
        else {
            Util.log('No Request sent', this.hasMoreRest, this.busyRest);
        }
    }

    loadRestAvailableServiceTypes = function (request) {
        var newRequest = Util.clone(request);

        this.appService.getAvailableServiceTypes(newRequest)
            .subscribe(response => {
                this.restNoResultConfig = {
                    icon: 'restaurant-menu-icon',
                    title: "We can't find restaurants for " + this.sharedDataService.serviceType + " service.",
                    subtitle: 'But we found results in other serivce types.',
                    buttons: []
                }

                this.restAvailableServiceTypes = {};
                this.restAvailableServiceTypesCount = 0;

                var availableServiceTypes = response.Table;

                for (var i in availableServiceTypes) {
                    var availableServiceType = availableServiceTypes[i];

                    if (availableServiceType.isExist) {
                        var button = {
                            title: this.constants.SERVICE_TYPE_TITLE[availableServiceType.MenuType],
                            type: 'service-type',
                            action: ((serviceType) => {
                                return () => {
                                    this.filtersComponent.canChangeServiceType(serviceType);

                                    Util.log('Change service type', serviceType);
                                }
                            })(this.constants.SERVICE_TYPE_TITLE[availableServiceType.MenuType])
                        };

                        this.restNoResultConfig.buttons.push(button);

                        this.restAvailableServiceTypesCount++;
                    }
                }

                if (this.restAvailableServiceTypesCount == 0) {
                    this.restNoResultConfig = Util.clone(this.defaultRestNoResultConfig);
                }

                Util.log('getAvailableServiceTypes', this.restAvailableServiceTypes);
                this.restNoResults = true;
                this.busyRest = false;
            });
    }

    selectTab = (tab) => {
        this.queryParams.activeTab = tab;

        this.router.navigate(['search'], { queryParams: this.queryParams });
    }

    filtersChangedEvent = (data) => {
        Util.log(this.LOG_TAG, data);

        if (Util.isDefined(data.keywordType)) {

            if (data.keywordType == this.constants.KEYWORD_TYPE_CUISINE) {
                this.sharedDataService.viewMode = this.constants.VIEW_MODE_DISH;

                this.router.navigate(['search'], { queryParams: this.queryParams });
            }
            else if (data.keywordType == this.constants.KEYWORD_TYPE_DISH || data.keywordType == this.constants.KEYWORD_TYPE_MENU_ITEM) {
                this.router.navigate(['menu'], { queryParams: this.queryParams });
            }
            else if (data.keywordType == this.constants.KEYWORD_TYPE_RESTAURANT) {
                this.sharedDataService.viewMode = this.constants.VIEW_MODE_RESTAURANT;

                this.router.navigate(['search'], { queryParams: this.queryParams });
            }

        }
        else {
            // Get appropriate request data according to selected tab
            var requestData = this.sharedDataService.viewMode == this.constants.VIEW_MODE_RESTAURANT ? this.restRequestData : this.dishRequestData;

            if (!SearchMenuAPIRequestData.compareQueryParams(requestData, this.queryParams)) {
                Util.log(this.LOG_TAG, 'query params not matched');

                this.router.navigate(['search'], { queryParams: this.queryParams });
            }
            else {
                Util.log(this.LOG_TAG, 'shared data not matched');

                this.initPage();
            }

        }
    }

    selectDishItem = (dish) => {
        if (dish.DishName !== '' && !QueryParams.keywordExist(this.queryParams, dish.DishName)) {
            QueryParams.addKeyword(this.queryParams, dish.DishName);
            //this.queryParams.keywords.push(dish.DishName);

            this.router.navigate(['menu'], { queryParams: this.queryParams });
        }
    }

    selectRestItem = (restaurant) => {
        this.router.navigate(['restaurant-details'], { queryParams: { restaurantID: restaurant.RestaurantID } });
    }

    openRestMapView = () => {
        this.router.navigate(['rest-map-view'], { queryParams: this.queryParams });
    }
}
