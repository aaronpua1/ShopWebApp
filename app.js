var express = require('express');
var querystring= require('querystring');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var crypto = require('crypto');
var bodyParser = require('body-parser');
var request = require('request');
var RateLimiter = require('limiter').RateLimiter;
//var DelayedResponse = require('http-delayed-response'); 
var config = require('./settings');
var session = require('express-session');
var app = express();
var async = require('async');
//var delayed = new DelayedResponse(req, res);
var limiter = new RateLimiter(2, 1000); // at most 2 request every 1000 ms
var throttledRequest = function() {
    var requestArgs = arguments;
    limiter.removeTokens(1, function() {
        request.apply(this, requestArgs);
    });
};
const util = require('util');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({secret: 'keyboard cat'}));
app.use(express.static(path.join(__dirname, 'public')));

// This function initializes the Shopify OAuth Process
// The template in views/embedded_app_redirect.ejs is rendered 
app.get('/shopify_auth', function(req, res) {
    if (req.query.shop) {
        req.session.shop = req.query.shop;
        res.render('embedded_app_redirect', {
            shop: req.query.shop,
            api_key: config.oauth.api_key,
            scope: config.oauth.scope,
            redirect_uri: config.oauth.redirect_uri
        });
    } else {
       res.render('embedded_app_redirect', {
            shop: req.session.shop,
            api_key: config.oauth.api_key,
            scope: config.oauth.scope,
            redirect_uri: config.oauth.redirect_uri
        });
    } 
})

app.get('/access_token', verifyRequest, function(req, res) {
    if (req.query.shop) {
        async.waterfall([
            function(callback) {
                var params = { 
                    client_id: config.oauth.api_key,
                    client_secret: config.oauth.client_secret,
                    code: req.query.code
                }
                var req_body = querystring.stringify(params);
                console.log(req_body)
                request({
                    url: 'https://' + req.query.shop + '/admin/oauth/access_token', 
                    method: "POST",
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(req_body)
                    },
                    body: req_body
                }, 
                function(err,resp,body) {
                    if(err) { 
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    console.log(body);
                    body = JSON.parse(body);
                    req.session.access_token = body.access_token;
                    console.log(req.session);
                    callback(null, body.access_token);
                });
            },
            function(access_token, callback) {
                var theme_id;
                request.get({
                    url: 'https://' + req.query.shop + '/admin/themes.json?fields=name,id,role',
                    headers: {
                        'X-Shopify-Access-Token': access_token
                    }
                }, 
                function(err, resp, body){
                    if(err) { 
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    console.log(body);
                    body = JSON.parse(body);                
                    for (var i = 0; i < body.themes.length; i++) {
                        if (body.themes[i].role == "main") {
                            theme_id = body.themes[i].id;
                            break;
                        }
                    }
                    req.session.theme_id = theme_id;
                    console.log(theme_id);
                    callback(null, access_token, theme_id);
                });
            },
            function(access_token, theme_id, callback) {
                var data = {
                    asset: {
                        key: "snippets\/simple-upsell.liquid",
                        src: "http:\/\/dl.dropboxusercontent.com\/s\/tmhfkp2b94tupfy\/simple-upsell.liquid"
                    }
                }
                req_body = JSON.stringify(data);
                
                request({
                    method: "PUT",
                    url: 'https://' + req.query.shop + '/admin/themes/' + theme_id + '/assets.json',
                    headers: {
                        'X-Shopify-Access-Token': access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err, resp, body){
                    if(err) { 
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    console.log(body);
                    body = JSON.parse(body);
                    callback(null, access_token, theme_id);
                });
            },
            function(access_token, theme_id, callback) {
                var data = {
                    asset: {
                        key: "assets\/contained-bootstrap.min.css",
                        src: "http:\/\/dl.dropboxusercontent.com\/s\/9xlkw3edoydnnhf\/contained-bootstrap.min.css"
                    }
                }
                req_body = JSON.stringify(data);
                
                request({
                    method: "PUT",
                    url: 'https://' + req.query.shop + '/admin/themes/' + theme_id + '/assets.json',
                    headers: {
                        'X-Shopify-Access-Token': access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err, resp, body){
                    if(err) { 
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    console.log(body);
                    body = JSON.parse(body);
                    callback(null, 'done');
                });
            }
        ],
        function(err, result) {
            if (err) {
                console.log(err);
                return res.json(500);
            }    
            res.redirect('/');
        });
    }
})

// Renders the install/login form
app.get('/install', function(req, res) {
    res.render('app_install', {
        title: 'Simple-Upsells Installation'
    });
})

// Renders content for a modal
app.get('/setup_instructions', function(req, res) {
    res.render('setup_instructions', {
        title: 'Setup Instructions'
    });
})

// This is to render the current-offers page that shows all active offers created by store owner 
// This page should display a table from the data retrieved from store metafields Namespace: suo 
// http://bootsnipp.com/snippets/BDDND
// https://datatables.net/reference/api/
app.get('/', function(req, res) {
     if (req.session.access_token) {
        request.get({
            url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=250&namespace=suo',
            headers: {
                'X-Shopify-Access-Token': req.session.access_token
            }
        }, 
        function(err, resp, body){
            if(err) {
                console.log(err);
                return res.json(JSON.parse(err));
            }
            
            var data = JSON.parse(body);
            console.log(data);
            
            var metafields = [];

            for (var key in data.metafields) {
                var temp = data.metafields[key].value + ";id:" + data.metafields[key].id.toString();
                console.log("METAFIELDS: " + JSON.stringify(temp));
                temp = JSON.parse(JSON.stringify(parse_values(temp)));
                metafields.push(temp);
            }

            var values = { metafields: JSON.parse(JSON.stringify(metafields)) };
            values = JSON.parse(JSON.stringify(values));
            console.log(values);
            
            res.render('current_offers', {
                title: 'Current Offers', 
                api_key: config.oauth.api_key,
                shop: req.session.shop,
                current_offers: values
            });
        })
    } else {
        //console.log("THIS SOB NEEDS TO WORK: " + JSON.stringify(req.query));
        if (req.query.shop) {
            req.session.shop = req.query.shop.replace(".myshopify.com", "");
            res.redirect('/shopify_auth');
        }
        else {
            res.redirect('/install');
        }
    }
})
/*
// This is to render the create-offer form page to allow users to customize their offers
// http://bootsnipp.com/snippets/3xv0n
// https://silviomoreto.github.io/bootstrap-select/
// http://www.jqueryscript.net/demo/Responsive-jQuery-Dual-Select-Boxes-For-Bootstrap-Bootstrap-Dual-Listbox/
app.get('/create-offer', function(req, res) {
    var result_products = {products: []};
    var result_metafields;
    var result_store;
    var store_upsell;
    var string_upsell;
    var store_products;
    var string_products;
    var result_values = {values: []};
    var string_keys = "";
    var unique_vendors = [];
    var unique_types = [];
    
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/products/count.json',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err,resp,body) {
                if(err) { 
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("GET RESPONSE: " + body);
                body = JSON.parse(body);
                callback(null, body);
            });
        },
        function(products, callback) {
            var pages = Number(products.count) / 250;
            var requests = [{
                method: "GET",
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?fields=value,key&namespace=suo',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }];
            if (pages > 0){
                for (var i = 0; i < pages; i++) {
                    var count = i + 1;
                    var temp_request = {
                        method: "GET",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit=250=&page=' + count + '&fields=id,title,vendor,product_type,handle,image',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token
                        }
                    }
                    requests.push(temp_request);
                }
            }
            else {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit=250&fields=id,title,vendor,product_type,handle,image',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token
                    }
                }
                requests.push(temp_request);
            }
            if (Object.keys(req.query).length > 0) {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token
                    }
                }
                requests.push(temp_request);
            }
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 200) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                });
            },  
            function(err, results) {
                if (err) {                   
                    console.log("THIS FUCKING ERRROR: " + err);
                     callback(err);
                    return next(err);
                }
                
                for (var i = 0; i < results.length; i++) {
                    if (results[i].hasOwnProperty('products')){
                        for (var j = 0; j < results[i].products.length; j++) {
                            result_products.products.push(results[i].products[j]);
                        }
                    }
                    else if (results[i].hasOwnProperty('metafields')) {
                        result_metafields = results[i];
                    }
                    else {
                        result_store = results[i];
                    }
                }
                console.log("RESULTS: " + JSON.stringify(result_products.products[0]));
                for (var i in result_products.products) {
                    if (unique_vendors.indexOf(result_products.products[i].vendor) === -1) {
                        unique_vendors.push(result_products.products[i].vendor);
                    }
                    if (unique_types.indexOf(result_products.products[i].product_type) === -1) {
                        unique_types.push(result_products.products[i].product_type);
                    }
                }
                console.log("SAD");
                for (var i = 0; i < result_metafields.metafields.length; i++) {
                    var temp = JSON.parse(JSON.stringify(parse_values(result_metafields.metafields[i].value)));
                    result_values.values.push(JSON.parse(JSON.stringify(parse_products(temp.products))));
                    string_keys += result_metafields.metafields[i].key;
                    if (i < result_metafields.metafields.length - 1) {
                        string_keys += "|"
                    }
                }
                
                if (result_store) {
                    result_store = JSON.parse(JSON.stringify(parse_values(result_store.metafield.value)));
                    store_upsell = JSON.parse(JSON.stringify(parse_products(result_store.upsell_products)));
                    store_products = JSON.parse(JSON.stringify(parse_products(result_store.products)));  
                    string_upsell = stringify_configs(store_upsell.products);
                    string_products = stringify_configs(store_products.products);
                    console.log("UPSELL STRING: " + JSON.stringify(store_upsell.products));
                    console.log("PRODUCT STRING: " + JSON.stringify(store_products.products));
                }
                console.log("WTF");
                callback(null, 'done');
                //console.log(JSON.stringify(result_metafields));
                //console.log(JSON.stringify(result_values));
            });
        }
    ],
    function(err, result) {
        if (err) {
            //console.log("RESULT: " + JSON.stringify(result));
            callback(true); 
            return; 
        }    
        //console.log("RESULT: " + JSON.stringify(result_products));
        //result_products = JSON.parse(JSON.stringify(result_products));
        result_products = JSON.parse(JSON.stringify(result_products));
        //console.log(util.inspect(result_products, false, null));
        res.render('create_offer', {
            title: 'Create Your Offer', 
            api_key: config.oauth.api_key,
            shop: req.session.shop,
            product_selections: result_products,
            store: result_store,
            store_upsell: store_upsell,
            store_products: store_products,
            upsell_config: string_upsell,
            product_config: string_products,
            metafields: result_values,
            keys: string_keys,
            key: req.query.key,
            vendors: unique_vendors,
            product_type: unique_types
        });
    });
})*/
app.get('/create-offer', function(req, res) {
    var result_products = {products: []};
    var result_metafields;
    var result_store;
    var store_upsell;
    var string_upsell;
    var store_products;
    var string_products;
    var result_values = {values: []};
    var string_keys = "";
    var unique_vendors = [];
    var unique_types = [];
    var string_meta_ids = "";
    var string_owner_ids = "";
    
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/products/count.json',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err,resp,body) {
                if(err) { 
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("GET RESPONSE: " + body);
                body = JSON.parse(body);
                callback(null, body);
            });
        },
        function(products, callback) {
            var pages = Number(products.count) / 250;
            var requests = [{
                method: "GET",
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?fields=value,key&namespace=suo',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }];
            if (pages > 0){
                for (var i = 0; i < pages; i++) {
                    var count = i + 1;
                    var temp_request = {
                        method: "GET",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit=250=&page=' + count + '&fields=id,title,vendor,product_type,handle,image',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token
                        }
                    }
                    requests.push(temp_request);
                }
            }
            else {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit=250&fields=id,title,vendor,product_type,handle,image',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token
                    }
                }
                requests.push(temp_request);
            }
            if (Object.keys(req.query).length > 0) {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token
                    }
                }
                requests.push(temp_request);
            }
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 200) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                });
            },  
            function(err, results) {
                if (err) {                   
                    console.log("THIS FUCKING ERRROR: " + err);
                     callback(err);
                    return next(err);
                }
                
                for (var i = 0; i < results.length; i++) {
                    if (results[i].hasOwnProperty('products')){
                        for (var j = 0; j < results[i].products.length; j++) {
                            result_products.products.push(results[i].products[j]);
                        }
                    }
                    else if (results[i].hasOwnProperty('metafields')) {
                        result_metafields = results[i];
                    }
                    else {
                        result_store = results[i];
                    }
                }
                console.log("RESULTS: " + JSON.stringify(result_products.products[0]));
                for (var i in result_products.products) {
                    if (unique_vendors.indexOf(result_products.products[i].vendor) === -1) {
                        unique_vendors.push(result_products.products[i].vendor);
                    }
                    if (unique_types.indexOf(result_products.products[i].product_type) === -1) {
                        unique_types.push(result_products.products[i].product_type);
                    }
                }
                console.log("SAD");
                for (var i = 0; i < result_metafields.metafields.length; i++) {
                    var temp = JSON.parse(JSON.stringify(parse_values(result_metafields.metafields[i].value)));
                    result_values.values.push(JSON.parse(JSON.stringify(parse_products(temp.products))));
                    string_keys += result_metafields.metafields[i].key;
                    if (i < result_metafields.metafields.length - 1) {
                        string_keys += "|"
                    }
                }
                
                if (result_store) {
                    result_store = JSON.parse(JSON.stringify(parse_values(result_store.metafield.value)));
                    store_upsell = JSON.parse(JSON.stringify(parse_products(result_store.upsell_products)));
                    store_products = JSON.parse(JSON.stringify(parse_products(result_store.products)));
                    string_meta_ids = result_store.prod_meta_ids;
                    string_owner_ids = result_store.owner_ids;
                    string_upsell = stringify_configs(store_upsell.products);
                    string_products = stringify_configs(store_products.products);
                    console.log("UPSELL STRING: " + JSON.stringify(store_upsell.products));
                    console.log("PRODUCT STRING: " + JSON.stringify(store_products.products));
                }
                console.log("WTF");
                callback(null, 'done');
                //console.log(JSON.stringify(result_metafields));
                //console.log(JSON.stringify(result_values));
            });
        }
    ],
    function(err, result) {
        if (err) {
            //console.log("RESULT: " + JSON.stringify(result));
            callback(true); 
            return; 
        }    
        //console.log("RESULT: " + JSON.stringify(result_products));
        //result_products = JSON.parse(JSON.stringify(result_products));
        result_products = JSON.parse(JSON.stringify(result_products));
        //console.log(util.inspect(result_products, false, null));
        res.render('create_offer', {
            title: 'Create Your Offer', 
            api_key: config.oauth.api_key,
            shop: req.session.shop,
            product_selections: result_products,
            store: result_store,
            store_upsell: store_upsell,
            store_products: store_products,
            upsell_config: string_upsell,
            product_config: string_products,
            metafields: result_values,
            keys: string_keys,
            key: req.query.key,
            vendors: unique_vendors,
            product_type: unique_types,
            prod_meta_ids: string_meta_ids,
            prod_owner_ids: string_owner_ids
        });
    });
})
/*
app.post('/create-offer', function(req, res) {
    var upsell_selections = [];
    var product_selections = [];
    //console.log("TEST: FUCKKKK!" + req.body.product_configs);
    //console.log("TEST: FUCKKKK!" + req.body.upsell_configs);
    var previous_product_selections = req.body.product_configs;
    
    if (Array.isArray(req.body.upsell_dual_box)) {
        upsell_selections = req.body.upsell_dual_box.slice(0);
    }
    else {
        upsell_selections.push(req.body.upsell_dual_box);
    }
    if (Array.isArray(req.body.product_dual_box)) {
        product_selections = req.body.product_dual_box.slice(0);
    }
    else {
        product_selections.push(req.body.product_dual_box);
    }
    
    var upsells = stringify_products(upsell_selections);
    
    if (previous_product_selections != "") {
        //console.log("POS: " + JSON.stringify(previous_product_selections));
        previous_product_selections = JSON.parse(JSON.stringify(parse_products(previous_product_selections)));
        //console.log("POS: " + JSON.stringify(previous_product_selections));
        var parsed_product_selections = [];
        
        for (var i in product_selections) {
            //console.log("BETWEEN POS AND SOB:" + JSON.stringify(product_selections[i]));
            parsed_product_selections.push(JSON.parse(JSON.stringify(parse_selections(product_selections[i]))));
        }
        //console.log("BETWEEN POS AND SOB: " + JSON.stringify(parsed_product_selections));
        //console.log("selections: " + parsed_product_selections[0].id);
        //console.log("previous: " + previous_product_selections.products[0].id);
        var product_differences = findDifferences(previous_product_selections.products, parsed_product_selections);
        
        //console.log("upsell selections:" + JSON.stringify(parsed_upsell_selections));
        //console.log("product selections:" + JSON.stringify(parsed_product_selections));
        //console.log("upsell parse configs:" + JSON.stringify(previous_upsell_selections));
        //console.log("product parse configs:" + JSON.stringify(previous_product_selections));
        //console.log("upsell configs:" + req.body.upsell_configs);
        //console.log("product configs:" + req.body.product_configs);
        //console.log("product diff:" + JSON.stringify(product_differences));
    }
    else {
        var product_differences = [];
    }
    async.parallel([
        function(callback) {
            if (product_differences.length > 0) {
                async.waterfall([
                    function(callback) {
                        var requests = [];
                        for (var i in product_differences) {
                            var temp_request = {
                                method: "GET",
                                url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + product_differences[i].id + '/metafields.json?namespace=suop',
                                headers: {
                                    'X-Shopify-Access-Token': req.session.access_token
                                }
                            }
                            requests.push(temp_request);
                        }
                        requests = JSON.parse(JSON.stringify(requests));
                        
                        async.map(requests, function(obj, callback) {
                            throttledRequest(obj, function(err, resp, body) {
                                if (!err && resp.statusCode == 200) {
                                    var body = JSON.parse(body);
                                    callback(null, body);
                                }
                                else {
                                    callback(err || resp.statusCode);
                                }
                            })
                        },  
                        function(err, result) {
                            if (err) {
                                console.log(err);
                                callback(true); 
                                return; 
                            }    
                            //console.log("GET PRODUCT RESPONSE: " + JSON.stringify(result));
                            callback(null, result);
                        });
                    },
                    function(product, callback) {
                        var requests = [];
                        if (product.length > 0) {
                            for (var i in product) {
                                if (product[i].metafields.length > 0) { 
                                    var temp_request = {
                                        method: "DELETE",
                                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + product[i].metafields[0].owner_id + '/metafields/' + product[i].metafields[0].id + '.json',
                                        headers: {
                                            'X-Shopify-Access-Token': req.session.access_token
                                        }
                                    }
                                    requests.push(temp_request);
                                }
                            }
                                    
                            requests = JSON.parse(JSON.stringify(requests));
                            
                            async.map(requests, function(obj, callback) {
                                throttledRequest(obj, function(err, resp, body) {
                                    if (!err && resp.statusCode == 200) {
                                        var body = JSON.parse(body);
                                        callback(null, body);
                                    }
                                    else {
                                        callback(err || resp.statusCode);
                                    }
                                })
                            },  
                            function(err, result) {
                                if (err) {
                                    console.log(err);
                                    callback(true); 
                                    return; 
                                }
                                //console.log("GET PRODUCT DELETE RESPONSE: " + JSON.stringify(result));
                                callback(null, 'done');
                            });                            
                        }
                        else {
                            callback(null, 'done');
                        }
                    }
                ],
                function(err, result) {
                    if (err) {
                        console.log(err);
                        callback(true); 
                        return; 
                    }    
                    //console.log("FIRST DELETE RESPONSE: " + JSON.stringify(result));
                    callback();
                });
            }
            else {
                console.log("FIRST SKIP");
                callback();
            }
        },
        function(callback) {   

            var requests = [];
            
            for (var i in product_selections) {
                var temp_product = JSON.parse(JSON.stringify(parse_selections(product_selections[i])));
                //console.log("PRODUCT: "+ temp_product.id);
 
                if (upsells != "") {                    
                    console.log("UPSELL HANDLES: " + upsells);
                    if (req.body.activate_offer) {
                        if (req.body.upsell_edge_type) {
                            if (req.body.button_edge_type) {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                            else {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:not_rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                        }
                        else {
                            if (req.body.button_edge_type) {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                            else {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:not_rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                        }
                    }
                    else {
                        if (req.body.upsell_edge_type) {
                            if (req.body.button_edge_type) {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                            else {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:not_rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                        }
                        else {
                            if (req.body.button_edge_type) {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                            else {
                                var data = {
                                    metafield: {
                                        namespace: "suop",
                                        key: "su1",
                                        value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:not_rounded",
                                        value_type: "string"
                                    }
                                }
                            }
                        }
                    }
                    req_body = JSON.stringify(data);
                    //console.log("POST REQUEST: "+ req_body);
                    
                    var temp_request = {
                        method: "POST",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + temp_product.id + '/metafields.json',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token,
                            'Content-type': 'application/json; charset=utf-8'
                        },
                        body: req_body
                    }
                    requests.push(temp_request);

                }
            }
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 201) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }    
                //console.log("SECOND SKIP DELETE RESPONSE: " + JSON.stringify(result));
                callback();
            });
        },
        function(callback) {
            async.waterfall([
                function(callback) {                    
                    if (req.body.key != "" && req.body.key != req.body.offer_name) {
                        request.get({
                            url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=250&namespace=suo' + '&key=' + req.body.key,
                            headers: {
                                'X-Shopify-Access-Token': req.session.access_token
                            }
                        }, 
                        function(err,resp,body) {
                            if(err) { 
                                console.log(err);
                                callback(true); 
                                return; 
                            }
                            console.log("GET RESPONSE: " + body);
                            body = JSON.parse(body);
                            callback(null, body.metafields);
                        });
                    }
                    else {
                        request.get({
                            url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=250&namespace=suo' + '&key=' + req.body.offer_name,
                            headers: {
                                'X-Shopify-Access-Token': req.session.access_token
                            }
                        }, 
                        function(err,resp,body) {
                            if(err) { 
                                console.log(err);
                                callback(true); 
                                return; 
                            }
                            console.log("GET RESPONSE: " + body);
                            body = JSON.parse(body);
                            callback(null, body.metafields);
                        });
                    }
                },
                function(metafields, callback) {
                    var upsell_products = "";
                    var products = "";
                    
                    if (Array.isArray(req.body.upsell_dual_box)) {
                        for (var key in req.body.upsell_dual_box) {
                            upsell_products += req.body.upsell_dual_box[key];
                            upsell_products += ",";
                        }
                        upsell_products = upsell_products.replace(/\,$/, '');
                    }
                    else {
                        upsell_products = req.body.upsell_dual_box;
                    }
                    if (Array.isArray(req.body.product_dual_box)) {
                        for (var key in req.body.product_dual_box) {
                            products += req.body.product_dual_box[key];
                            products += ",";
                        }
                        products = products.replace(/\,$/, '');
                    }
                    else {
                        products = req.body.product_dual_box;
                    }
                    
                    if (req.body.key != "" && metafields.length > 0) {
                        var id = metafields[0].id.toString();
                        //var values = "offer_id:" + id + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products// + ";offer_type:" + req.body.offer_type
                        var data = {
                            metafield: {
                                id: metafields[0].id,
                                value: "offer_id:" + id + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products + ";status:" + req.body.activate_offer + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:" + req.body.upsell_edge_type + ";button_edge_type:" + req.body.button_edge_type,
                                value_type: "string"
                            }
                        }
                        req_body = JSON.stringify(data);
                        //console.log(data);
                        console.log("PUT REQUEST: " + req_body);
                        request({
                            method: "PUT",
                            url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + id + '.json',
                            headers: {
                                'X-Shopify-Access-Token': req.session.access_token,
                                'Content-type': 'application/json; charset=utf-8'
                            },
                            body: req_body
                        }, 
                        function(err, resp, body){
                            if(err) { 
                                console.log(err);
                                callback(true); 
                                return; 
                            }
                            console.log("PUT RESPONSE: " + body);
                            
                            body = JSON.parse(body);
                            callback(null, 'done');
                        });
                    }
                    else {
                        //var values1 = "offer_id:0;offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products// + ";offer_type:" + req.body.offer_type
                        var data1 = {
                            metafield: {
                                namespace: "suo",
                                key: req.body.offer_name,
                                value: "offer_id:0;offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products + ";status:" + req.body.activate_offer + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:" + req.body.upsell_edge_type + ";button_edge_type:" + req.body.button_edge_type,
                                value_type: "string"
                            }
                        }
                        req_body = JSON.stringify(data1);
                        //console.log(data1);
                        console.log("POST REQUEST: " + req_body);
                        request({
                            method: "POST",
                            url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
                            headers: {
                                'X-Shopify-Access-Token': req.session.access_token,
                                'Content-type': 'application/json; charset=utf-8'
                            },
                            body: req_body
                        }, 
                        function(err1, resp1, body1){
                            if(err1) { 
                                console.log(err1);
                                callback(true); 
                                return; 
                            }
                            //console.log("POST RESPONSE" + body1);                            
                            body1 = JSON.parse(body1);
                            
                            //var values2 = "offer_id:" + id + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products// + ";offer_type:" + req.body.offer_type
                            var id = body1.metafield.id.toString();
                            
                            var data2 = {
                                metafield: {
                                    id: body1.metafield.id,
                                    value: "offer_id:" + id + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products + ";status:" + req.body.activate_offer + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:" + req.body.upsell_edge_type + ";button_edge_type:" + req.body.button_edge_type,
                                    value_type: "string"
                                }
                            }
                            req_body = JSON.stringify(data2);
                            //console.log(data2);
                            //console.log("PUT REQUEST: " + req_body);
                            request({
                                method: "PUT",
                                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + id + '.json',
                                headers: {
                                    'X-Shopify-Access-Token': req.session.access_token,
                                    'Content-type': 'application/json; charset=utf-8'
                                },
                                body: req_body
                            }, 
                            function(err2, resp2, body2){
                                if(err2) { 
                                    console.log(err2);
                                    callback(true); 
                                    return; 
                                }
                                //console.log("PUT RESPONSE: " + body2);
                                body2 = JSON.parse(body2);
                                callback(null, 'done');
                            });
                        });
                    }
                }
            ],
            function(err, result) {
                if (err) {
                    //console.log("STORE META ERROR: " + err);
                    callback(true); 
                    return; 
                }    
                //console.log(result);
                callback(null, 'done');
            });
        }
    ],
    function(err, result) {
        console.log("FINAL RESPONSE: " + JSON.stringify(result));
        if (err) {
            console.log(err);
            return res.json(500);
        }
        res.redirect('/');
    });
})*/

app.post('/create-offer', function(req, res) {
    var upsell_selections = [];
    var product_selections = [];
    //console.log("TEST: FUCKKKK!" + req.body.product_configs);
    //console.log("TEST: FUCKKKK!" + req.body.upsell_configs);
    //var previous_product_selections = req.body.product_configs;
    
    if (Array.isArray(req.body.upsell_dual_box)) {
        upsell_selections = req.body.upsell_dual_box.slice(0);
    }
    else {
        upsell_selections.push(req.body.upsell_dual_box);
    }
    if (Array.isArray(req.body.product_dual_box)) {
        product_selections = req.body.product_dual_box.slice(0);
    }
    else {
        product_selections.push(req.body.product_dual_box);
    }
    
    var upsells = stringify_products(upsell_selections);
    
    //if (previous_product_selections != "") {
        //console.log("POS: " + JSON.stringify(previous_product_selections));
        //previous_product_selections = JSON.parse(JSON.stringify(parse_products(previous_product_selections)));
        //console.log("POS: " + JSON.stringify(previous_product_selections));
        //var parsed_product_selections = [];
        
        //for (var i in product_selections) {
            //console.log("BETWEEN POS AND SOB:" + JSON.stringify(product_selections[i]));
            //parsed_product_selections.push(JSON.parse(JSON.stringify(parse_selections(product_selections[i]))));
        //}
        //console.log("BETWEEN POS AND SOB: " + JSON.stringify(parsed_product_selections));
        //console.log("selections: " + parsed_product_selections[0].id);
        //console.log("previous: " + previous_product_selections.products[0].id);
        //var product_differences = findDifferences(previous_product_selections.products, parsed_product_selections);
        
        //console.log("upsell selections:" + JSON.stringify(parsed_upsell_selections));
        //console.log("product selections:" + JSON.stringify(parsed_product_selections));
        //console.log("upsell parse configs:" + JSON.stringify(previous_upsell_selections));
        //console.log("product parse configs:" + JSON.stringify(previous_product_selections));
        //console.log("upsell configs:" + req.body.upsell_configs);
        //console.log("product configs:" + req.body.product_configs);
        //console.log("product diff:" + JSON.stringify(product_differences));
    //}
    //else {
        //var product_differences = [];
    //}

    async.waterfall([
        function(callback) {
            var requests = [];
            var prev_owner_ids = req.body.prev_owner_ids;
            var prev_meta_ids = req.body.prev_meta_ids;
            
            if (prev_owner_ids != "" && prev_meta_ids != "") {
                prev_owner_ids = prev_owner_ids.split(",");
                prev_meta_ids = prev_meta_ids.split(",");
            }
            
            for (var i in product_selections) {
                var temp_product = JSON.parse(JSON.stringify(parse_selections(product_selections[i])));
                if (Array.isArray(prev_owner_ids)) {
                    var index = prev_owner_ids.indexOf(temp_product.id); //HERE NEEDS TO BE PARSED
                }
                else {
                    var index = -1;
                }
                
                if (upsells != "") {
                    if (index === -1) {
                        if (req.body.activate_offer) {
                            if (req.body.upsell_edge_type) {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                            else {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                        }
                        else {
                            if (req.body.upsell_edge_type) {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                            else {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            namespace: "suop",
                                            key: "su1",
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                        }
                        req_body = JSON.stringify(data);
                        //console.log("POST REQUEST: "+ req_body);
                        
                        var temp_request = {
                            method: "POST",
                            url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + temp_product.id + '/metafields.json',
                            headers: {
                                'X-Shopify-Access-Token': req.session.access_token,
                                'Content-type': 'application/json; charset=utf-8'
                            },
                            body: req_body
                        }
                        requests.push(temp_request);
                    }
                    else {
                        if (req.body.activate_offer) {
                            if (req.body.upsell_edge_type) {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                            else {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:on;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                        }
                        else {
                            if (req.body.upsell_edge_type) {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                            else {
                                if (req.body.button_edge_type) {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                                else {
                                    var data = {
                                        metafield: {
                                            id: prev_meta_ids[index],
                                            value: "handle:" + upsells + ";status:off;offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:not_rounded;button_edge_type:not_rounded",
                                            value_type: "string"
                                        }
                                    }
                                }
                            }
                        }
                        req_body = JSON.stringify(data);
                        //console.log("POST REQUEST: "+ req_body);
                        
                        var temp_request = {
                            method: "PUT",
                            url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + temp_product.id + '/metafields/' + prev_meta_ids[index] + '.json',
                            headers: {
                                'X-Shopify-Access-Token': req.session.access_token,
                                'Content-type': 'application/json; charset=utf-8'
                            },
                            body: req_body
                        }
                        requests.push(temp_request);
                    }
                }
            }
            console.log("PUT/POST PRODUCT REQUESTS: " + JSON.stringify(requests));
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && (resp.statusCode == 201 || resp.statusCode == 200)) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }    
                console.log("PUT/POST PRODUCT RESPONSE: " + JSON.stringify(result));
                callback(null, result);
            });
        },
        function(products, callback) {                    
            if (req.body.key != "" && req.body.key != req.body.offer_name) {
                request.get({
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=250&namespace=suo' + '&key=' + req.body.key,
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token
                    }
                }, 
                function(err,resp,body) {
                    if(err) { 
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    console.log("GET RESPONSE: " + body);
                    body = JSON.parse(body);
                    callback(null, body.metafields, products);
                });
            }
            else {
                request.get({
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=250&namespace=suo' + '&key=' + req.body.offer_name,
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token
                    }
                }, 
                function(err,resp,body) {
                    if(err) { 
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    console.log("GET RESPONSE: " + body);
                    body = JSON.parse(body);
                    callback(null, body.metafields, products);
                });
            }
        },
        function(metafields, product_ids, callback) {
            var upsell_products = "";
            var products = "";
            var ids = "";
            var owner_ids = "";

            for (var i in product_ids) {
                owner_ids += product_ids[i].metafield.owner_id;
                owner_ids += ",";
                ids += product_ids[i].metafield.id;
                ids += ",";
            }
            ids = ids.replace(/\,$/, '');
            owner_ids = owner_ids.replace(/\,$/, '');
            
            if (Array.isArray(req.body.upsell_dual_box)) {
                for (var key in req.body.upsell_dual_box) {
                    upsell_products += req.body.upsell_dual_box[key];
                    upsell_products += ",";
                }
                upsell_products = upsell_products.replace(/\,$/, '');
            }
            else {
                upsell_products = req.body.upsell_dual_box;
            }
            if (Array.isArray(req.body.product_dual_box)) {
                for (var key in req.body.product_dual_box) {
                    products += req.body.product_dual_box[key];
                    products += ",";
                }
                products = products.replace(/\,$/, '');
            }
            else {
                products = req.body.product_dual_box;
            }
            
            if (req.body.key != "" && metafields.length > 0) {
                var id = metafields[0].id.toString();
                //var values = "offer_id:" + id + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products// + ";offer_type:" + req.body.offer_type
                var data = {
                    metafield: {
                        id: metafields[0].id,
                        value: "offer_id:" + id + ";owner_ids:" + owner_ids + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products + ";status:" + req.body.activate_offer + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:" + req.body.upsell_edge_type + ";button_edge_type:" + req.body.button_edge_type + ";prod_meta_ids:" + ids,
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data);
                //console.log(data);
                console.log("PUT REQUEST: " + req_body);
                request({
                    method: "PUT",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err, resp, body){
                    if(err) { 
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    console.log("PUT RESPONSE: " + body);
                    
                    body = JSON.parse(body);
                    callback(null, ids, owner_ids);
                });
            }
            else {
                //var values1 = "offer_id:0;offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products// + ";offer_type:" + req.body.offer_type
                var data1 = {
                    metafield: {
                        namespace: "suo",
                        key: req.body.offer_name,
                        value: "offer_id:0;" + "owner_ids:" + owner_ids + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products + ";status:" + req.body.activate_offer + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:" + req.body.upsell_edge_type + ";button_edge_type:" + req.body.button_edge_type + ";prod_meta_ids:" + ids,
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data1);
                //console.log(data1);
                console.log("POST REQUEST: " + req_body);
                request({
                    method: "POST",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err1, resp1, body1){
                    if(err1) { 
                        console.log(err1);
                        callback(true); 
                        return; 
                    }
                    //console.log("POST RESPONSE" + body1);                            
                    body1 = JSON.parse(body1);
                    
                    //var values2 = "offer_id:" + id + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products// + ";offer_type:" + req.body.offer_type
                    var id = body1.metafield.id.toString();
                    
                    var data2 = {
                        metafield: {
                            id: body1.metafield.id,
                            value: "offer_id:" + id + ";owner_ids:" + owner_ids + ";offer_name:" + req.body.offer_name + ";offer_title:" + req.body.offer_title + ";offer_description:" + req.body.offer_description + ";upsell_products:" + upsell_products + ";products:" + products + ";status:" + req.body.activate_offer + ";background_color:" + req.body.background_color + ";border_highlight_color:" + req.body.border_highlight_color + ";border_color:" + req.body.border_color + ";button_color:" + req.body.button_color + ";upsell_edge_type:" + req.body.upsell_edge_type + ";button_edge_type:" + req.body.button_edge_type + ";prod_meta_ids:" + ids,
                            value_type: "string"
                        }
                    }
                    req_body = JSON.stringify(data2);
                    //console.log(data2);
                    //console.log("PUT REQUEST: " + req_body);
                    request({
                        method: "PUT",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + id + '.json',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token,
                            'Content-type': 'application/json; charset=utf-8'
                        },
                        body: req_body
                    }, 
                    function(err2, resp2, body2){
                        if(err2) { 
                            console.log(err2);
                            callback(true); 
                            return; 
                        }
                        //console.log("PUT RESPONSE: " + body2);
                        body2 = JSON.parse(body2);
                        callback(null, ids, owner_ids);
                    });
                });
            }
        },
        function(ids, owner_ids, callback) { //HERE
            var product_differences = [];
            var prev_owner_ids = req.body.prev_owner_ids;
            var prev_meta_ids = req.body.prev_meta_ids;
            var current_meta_ids = [];
            var current_owner_ids = [];
            
            if (prev_owner_ids != "" && prev_meta_ids != "") {
                prev_owner_ids = prev_owner_ids.split(",");
                prev_meta_ids = prev_meta_ids.split(",");
                current_meta_ids = ids.split(",");
                current_owner_ids = owner_ids.split(",");
                product_differences = findDifferences(prev_owner_ids, current_owner_ids); 
            }
            /*if (req.body.prev_meta_ids != "" && req.body.prev_owner_ids != "") {
                var current_meta_ids = ids.split(",");
                var current_owner_ids = owner_ids.split(",");
                var prev_owner_ids = req.body.prev_owner_ids.split(",");
                var prev_meta_ids = req.body.prev_meta_ids.split(",");
                //var merged_prev = mergeValues(own_ids, meta_ids);
                //var merged_current = mergeValues(prev_owner_ids, prev_meta_ids);
                product_differences = findDifferences(prev_owner_ids, current_owner_ids);                    
            }*/
            console.log("THIS FUCKING SHIT: " + JSON.stringify(product_differences));
            if (product_differences.length > 0) {
                var requests = [];

                for (var i in product_differences) {
                    var index = prev_owner_ids.indexOf(product_differences[i]);
                    var temp_request = {
                        method: "DELETE",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + prev_owner_ids[index] + '/metafields/' + prev_meta_ids[index] + '.json',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token
                        }
                    }
                    requests.push(temp_request);
                }
                        
                requests = JSON.parse(JSON.stringify(requests));
                
                async.map(requests, function(obj, callback) {
                    throttledRequest(obj, function(err, resp, body) {
                        if (!err && (resp.statusCode == 200 || resp.statusCode == 404)) {
                            var body = JSON.parse(body);
                            callback(null, body);
                        }
                        else {
                            callback(err || resp.statusCode);
                        }
                    })
                },  
                function(err, result) {
                    if (err) {
                        console.log(err);
                        callback(true); 
                        return; 
                    }
                    //console.log("GET PRODUCT DELETE RESPONSE: " + JSON.stringify(result));
                    callback(null, 'done');
                });
            }
            else {
                callback(null, 'done');
            }
        },
    ],
    function(err, result) {
        console.log("FINAL RESPONSE: " + JSON.stringify(result));
        if (err) {
            console.log(err);
            return res.json(500);
        }
        res.redirect('/');
    });    
})
/*
//GOOD
//https://cdn.shopify.com/s/files/1/1826/5527/products/news-icon-7728.png?v=1490957249
//https://cdn.shopify.com/s/files/1/1826/5527/products/folder-icon-25160.png?v=1490957265
//https://cdn.shopify.com/s/files/1/1826/5527/products/grasping-shrimp-net-icons-40948.png?v=1490957279
// This is used to allow store owners to delete their offers from the store metafields Namespace: suo
app.get('/delete-offer', function(req, res) {
    request({
        method: "DELETE",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        }
    }, function(err, resp, body){
        if(err)
            return next(err);
        console.log(body);
        body = JSON.parse(body);
        if (body.errs) {
            return res.json(404);
        } 
        res.json(200);
    });
})*/
/*
app.get('/delete-offer', function(req, res) {
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err,resp,body) {
                if(err) { 
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("METAFIELD GET RESPONSE: " + body);
                body = JSON.parse(body);
                
                var values = JSON.parse(JSON.stringify(parse_values(body.metafield.value)));
                values = JSON.parse(JSON.stringify(parse_products(values.products)));
                console.log("PARSE PRODUCTS: " + JSON.stringify(values));
                callback(null, values);
            });
        },
        function(values, callback) { //go thru each product here to get metafield id
            var requests = [];
            for (var i in values.products) {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values.products[i].id + '/metafields.json?namespace=suop',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    }
                }
                requests.push(temp_request);
            }
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 200) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }    
                console.log("PRODUCT GET RESPONSE" + JSON.stringify(result));
                //result = JSON.parse(result);
                callback(null, result);
            });
        },
        function(values, callback) {
            var requests = [];
            for (var i in values) {
                //values[i] = JSON.parse(values[i]);
                if (values[i].metafields.length > 0) {
                    var temp_request = {
                        method: "DELETE",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values[i].metafields[0].owner_id + '/metafields/' + values[i].metafields[0].id + '.json',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token,
                            'Content-type': 'application/json; charset=utf-8'
                        }
                    }
                    requests.push(temp_request);
                }
            }
            var temp_request = {
                method: "DELETE",
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token,
                    'Content-type': 'application/json; charset=utf-8'
                }
            }
            requests.push(temp_request);
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 200) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("DELETE RESPONSE" + JSON.stringify(result));
                callback(null, 'done');
            });
        }
    ],
    function(err, resp, body){
        if(err) {
            return res.json(404);
        }
        res.json(200);
    });
})

app.get('/activate-offer', function(req, res) {
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err1,resp1,body1) {
                if(err1) { 
                    console.log(err1);
                    callback(true); 
                    return; 
                }
                console.log("METAFIELD GET RESPONSE: " + body1);
                body1 = JSON.parse(body1);                
                
                var data = {
                    metafield: {
                        id: req.query.id,
                        value: body1.metafield.value.replace('status:undefined', 'status:on'),
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data);

                console.log("PUT REQUEST: " + req_body);
                request({
                    method: "PUT",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err2, resp2, body2){
                    if(err2) { 
                        console.log(err2);
                        callback(true); 
                        return; 
                    }
                    console.log("PUT RESPONSE: " + body2);
                    body2 = JSON.parse(body2);
                    var values = JSON.parse(JSON.stringify(parse_values(body1.metafield.value)));
                    values = JSON.parse(JSON.stringify(parse_products(values.products)));
                    console.log("PARSE PRODUCTS: " + JSON.stringify(values));
                    callback(null, values);
                });
            });
        },
        function(values, callback) { //go thru each product here to get metafield id
            var requests = [];
            for (var i in values.products) {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values.products[i].id + '/metafields.json?namespace=suop',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    }
                }
                requests.push(temp_request);
            }
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 200) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }    
                console.log("PRODUCT GET RESPONSE" + JSON.stringify(result));
                //result = JSON.parse(result);
                callback(null, result);
            });
        },
        function(values, callback) { //HERE
            var requests = [];
            for (var i in values) {
                if (values[i].metafields.length > 0) {
                    var temp = values[i].metafields[0].value.replace('status:off', 'status:on');
                    var data = {
                        metafield: {
                            id: values[i].metafields[0].id,
                            value: temp,
                            value_type: "string"
                        }
                    }
                    req_body = JSON.stringify(data);
                    console.log("PUT REQUEST: "+ req_body);
                    
                    var temp_request = {
                        method: "PUT",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values[i].metafields[0].owner_id + '/metafields/' + values[i].metafields[0].id + '.json',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token,
                            'Content-type': 'application/json; charset=utf-8'
                        },
                        body: req_body
                    }
                    requests.push(temp_request);
                }
            }
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 201) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("PUT RESPONSE" + JSON.stringify(result));
                callback(null, 'done');
            });
        }
    ],
    function(err, resp, body){
        if(err) {
            return res.json(404);
        }
        res.json(200);
    });
})

app.get('/deactivate-offer', function(req, res) {
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err1,resp1,body1) {
                if(err1) { 
                    console.log(err1);
                    callback(true); 
                    return; 
                }
                console.log("METAFIELD GET RESPONSE: " + body1);
                body1 = JSON.parse(body1);                
                
                var data = {
                    metafield: {
                        id: req.query.id,
                        value: body1.metafield.value.replace('status:on', 'status:undefined'),
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data);

                console.log("PUT REQUEST: " + req_body);
                request({
                    method: "PUT",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err2, resp2, body2){
                    if(err2) { 
                        console.log(err2);
                        callback(true); 
                        return; 
                    }
                    console.log("PUT RESPONSE: " + body2);
                    body2 = JSON.parse(body2);
                    var values = JSON.parse(JSON.stringify(parse_values(body1.metafield.value)));
                    values = JSON.parse(JSON.stringify(parse_products(values.products)));
                    console.log("PARSE PRODUCTS: " + JSON.stringify(values));
                    callback(null, values);
                });
            });
        },
        function(values, callback) { //go thru each product here to get metafield id
            var requests = [];
            for (var i in values.products) {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values.products[i].id + '/metafields.json?namespace=suop',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    }
                }
                requests.push(temp_request);
            }
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                request(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 200) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }    
                console.log("PRODUCT GET RESPONSE" + JSON.stringify(result));
                //result = JSON.parse(result);
                callback(null, result);
            });
        },
        function(values, callback) {
            var requests = [];
            for (var i in values) {
                //values[i] = JSON.parse(values[i]);
                if (values[i].metafields.length > 0) {
                    var temp = values[i].metafields[0].value.replace('status:on', 'status:off');
                    var data = {
                        metafield: {
                            id: values[i].metafields[0].id,
                            value: temp,
                            value_type: "string"
                        }
                    }
                    req_body = JSON.stringify(data);
                    console.log("PUT REQUEST: "+ req_body);
                    
                    var temp_request = {
                        method: "PUT",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values[i].metafields[0].owner_id + '/metafields/' + values[i].metafields[0].id + '.json',
                        headers: {
                            'X-Shopify-Access-Token': req.session.access_token,
                            'Content-type': 'application/json; charset=utf-8'
                        },
                        body: req_body
                    }
                    requests.push(temp_request);
                }
            }
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                request(obj, function(err, resp, body) {
                    if (!err && resp.statusCode == 201) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("PUT RESPONSE" + JSON.stringify(result));
                callback(null, 'done');
            });
        }
    ],
    function(err, resp, body){
        if(err) {
            return res.json(404);
        }
        res.json(200);
    });
})*/

app.get('/delete-offer', function(req, res) {
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err,resp,body) {
                if(err) { 
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("METAFIELD GET RESPONSE: " + body);
                body = JSON.parse(body);
                
                var values = JSON.parse(JSON.stringify(parse_values(body.metafield.value)));
                //values = JSON.parse(JSON.stringify(parse_products(values.products)));
                //console.log("PARSE PRODUCTS: " + JSON.stringify(values));
                callback(null, values);
            });
        },
        function(values, callback) {
            var requests = [];
            
            var ids = values.prod_meta_ids.split(",");
            var owner_ids = values.owner_ids.split(",");
            var merged_values = mergeValues(owner_ids, ids);
            
            for (var i in merged_values) {
                var temp_request = {
                    method: "DELETE",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + merged_values[i].owner_id + '/metafields/' + merged_values[i].meta_id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    }
                }
                requests.push(temp_request);                
            }

            requests.push(temp_request);
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && (resp.statusCode == 200 || resp.statusCode == 404)) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("DELETE RESPONSE" + JSON.stringify(result));
                callback(null);
            });
        },
        function(callback) {
            request({
                method: "DELETE",
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token,
                    'Content-type': 'application/json; charset=utf-8'
                }
            }, 
            function(err,resp,body) {
                if(err) { 
                    console.log(err);
                    callback(true); 
                    return; 
                }
                callback(null, 'done');
            });
        }
    ],
    function(err, resp, body){
        if(err) {
            return res.json(404);
        }
        res.json(200);
    });
})

app.get('/activate-offer', function(req, res) {
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err1,resp1,body1) {
                if(err1) { 
                    console.log(err1);
                    callback(true); 
                    return; 
                }
                console.log("METAFIELD GET RESPONSE: " + body1);
                body1 = JSON.parse(body1);                
                
                var data = {
                    metafield: {
                        id: req.query.id,
                        value: body1.metafield.value.replace('status:undefined', 'status:on'),
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data);

                console.log("PUT REQUEST: " + req_body);
                request({
                    method: "PUT",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err2, resp2, body2){
                    if(err2) { 
                        console.log(err2);
                        callback(true); 
                        return; 
                    }
                    console.log("PUT RESPONSE: " + body2);
                    body2 = JSON.parse(body2);
                    var values = JSON.parse(JSON.stringify(parse_values(body1.metafield.value)));
                    //values = JSON.parse(JSON.stringify(parse_products(values.products)));
                    //console.log("PARSE PRODUCTS: " + JSON.stringify(values));
                    callback(null, values);
                });
            });
        },
        function(values, callback) { //HERE            
            var requests = [];
            var ids = values.prod_meta_ids.split(",");
            var owner_ids = values.owner_ids.split(",");
            var merged_values = mergeValues(owner_ids, ids);
            var upsells = JSON.parse(JSON.stringify(parse_products(values.upsell_products)));
            var string_upsells = "";
            
            for (var i in upsells.products) {
                string_upsells += upsells.products[i].handle;
                string_upsells += "|";
            }
            string_upsells = string_upsells.substring(0, string_upsells.length - 1);
            
            for (var i in merged_values) {
                var temp = "handle:" + string_upsells + ";status:on;offer_title:" + values.offer_title + ";offer_description:" + values.offer_description + ";background_color:" + values.background_color + ";border_highlight_color:" + values.border_highlight_color + ";border_color:" + values.border_color + ";button_color:" + values.button_color + ";upsell_edge_type:" + values.upsell_edge_type + ";button_edge_type:" + values.button_edge_type;
                var data = {
                    metafield: {
                        id: merged_values[i].meta_id,
                        value: temp,
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data);
                console.log("PUT REQUEST: "+ req_body);
                
                var temp_request = {
                    method: "PUT",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + merged_values[i].owner_id + '/metafields/' + merged_values[i].meta_id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }
                requests.push(temp_request);
            }
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && (resp.statusCode == 201 || resp.statusCode == 200)) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("PUT RESPONSE" + JSON.stringify(result));
                callback(null, 'done');
            });
        }
    ],
    function(err, resp, body){
        if(err) {
            return res.json(404);
        }
        res.json(200);
    });
})

app.get('/deactivate-offer', function(req, res) {
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json?fields=value',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token
                }
            }, 
            function(err1,resp1,body1) {
                if(err1) { 
                    console.log(err1);
                    callback(true); 
                    return; 
                }
                console.log("METAFIELD GET RESPONSE: " + body1);
                body1 = JSON.parse(body1);                
                
                var data = {
                    metafield: {
                        id: req.query.id,
                        value: body1.metafield.value.replace('status:on', 'status:undefined'),
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data);

                console.log("PUT REQUEST: " + req_body);
                request({
                    method: "PUT",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.query.id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }, 
                function(err2, resp2, body2){
                    if(err2) { 
                        console.log(err2);
                        callback(true); 
                        return; 
                    }
                    console.log("PUT RESPONSE: " + body2);
                    body2 = JSON.parse(body2);
                    var values = JSON.parse(JSON.stringify(parse_values(body1.metafield.value)));
                    //values = JSON.parse(JSON.stringify(parse_products(values.products)));
                    //console.log("PARSE PRODUCTS: " + JSON.stringify(values));
                    callback(null, values);
                });
            });
        },
        function(values, callback) { //HERE            
            var requests = [];
            var ids = values.prod_meta_ids.split(",");
            var owner_ids = values.owner_ids.split(",");
            var merged_values = mergeValues(owner_ids, ids);
            var upsells = JSON.parse(JSON.stringify(parse_products(values.upsell_products)));
            var string_upsells = "";
            
            for (var i in upsells.products) {
                string_upsells += upsells.products[i].handle;
                string_upsells += "|";
            }
            string_upsells = string_upsells.substring(0, string_upsells.length - 1);
            
            for (var i in merged_values) {
                var temp = "handle:" + string_upsells + ";status:off;offer_title:" + values.offer_title + ";offer_description:" + values.offer_description + ";background_color:" + values.background_color + ";border_highlight_color:" + values.border_highlight_color + ";border_color:" + values.border_color + ";button_color:" + values.button_color + ";upsell_edge_type:" + values.upsell_edge_type + ";button_edge_type:" + values.button_edge_type;
                var data = {
                    metafield: {
                        id: merged_values[i].meta_id,
                        value: temp,
                        value_type: "string"
                    }
                }
                req_body = JSON.stringify(data);
                console.log("PUT REQUEST: "+ req_body);
                
                var temp_request = {
                    method: "PUT",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + merged_values[i].owner_id + '/metafields/' + merged_values[i].meta_id + '.json',
                    headers: {
                        'X-Shopify-Access-Token': req.session.access_token,
                        'Content-type': 'application/json; charset=utf-8'
                    },
                    body: req_body
                }
                requests.push(temp_request);
            }
            
            requests = JSON.parse(JSON.stringify(requests));
            
            async.map(requests, function(obj, callback) {
                throttledRequest(obj, function(err, resp, body) {
                    if (!err && (resp.statusCode == 201 || resp.statusCode == 200)) {
                        var body = JSON.parse(body);
                        callback(null, body);
                    }
                    else {
                        callback(err || resp.statusCode);
                    }
                })
            },  
            function(err, result) {
                if (err) {
                    console.log(err);
                    callback(true); 
                    return; 
                }
                console.log("PUT RESPONSE" + JSON.stringify(result));
                callback(null, 'done');
            });
        }
    ],
    function(err, resp, body){
        if(err) {
            return res.json(404);
        }
        res.json(200);
    });
})
function verifyRequest(req, res, next) {
    var map = JSON.parse(JSON.stringify(req.query));
    delete map['signature'];
    delete map['hmac'];

    var message = querystring.stringify(map);
    var generated_hash = crypto.createHmac('sha256', config.oauth.client_secret).update(message).digest('hex');
    console.log(generated_hash);
    console.log(req.query.hmac);
    if (generated_hash === req.query.hmac) {
        next();
    } else {
        return res.json(400);
    }
}
/* GOOD
function findDifferences(arr1, arr2) {
    difference = [];
    for (var i = 0; i < arr1.length; i++) {
        var contains = false;
        for (var j = 0; j < arr2.length; j++) {
            console.log(arr1[i].id);
            console.log(arr2[j].id);
            if (arr1[i].id == arr2[j].id) {
                contains = true;
                break;
            }
        }
        if (!contains) {
            difference.push({'id':arr1[i].id, 'handle':arr1[i].handle});
        }
    }
    return difference;
}
*/
function findDifferences(arr1, arr2) {
    difference = [];
    for (var i = 0; i < arr1.length; i++) {
        var contains = false;
        for (var j = 0; j < arr2.length; j++) {
            if (arr1[i] == arr2[j]) {
                contains = true;
                break;
            }
        }
        if (!contains) {
            difference.push(arr1[i]);
        }
    }
    return difference;
}
function parse_values(values) {
    var result = {};
    var pairs = values.split(";");
    
    for (var i = 0; i < pairs.length; i++) {
        var temp = pairs[i].split(":");
        result[temp[0]] = temp[1];
    }
    return result;
}

function stringify_configs(values) {
    var result = "";
    
    for (var i = 0; i < values.length; i++) {
        result += 'id=' + values[i].id + '|handle=' + values[i].handle;
        if (i < (values.length - 1)) {
            result += ",";
        }
    }
    //result.replace(/\,$/, '');
    return result;
}

function stringify_products(values) {    
    var result = "";   
    
    for (var i = 0; i < values.length; i++) {
        result += JSON.parse(JSON.stringify(parse_selections(values[i]))).handle;
        if (i < (values.length - 1)) {
            result += "|";
        }
    }
    return result;
}

function parse_selections(values) {
    var result = {};
    var pairs = values.split("|");
    
    for (var i = 0; i < pairs.length; i++) {
        var temp = pairs[i].split("=");
        result[temp[0]] = temp[1];
    }
    return result;
}
function mergeValues(arr1, arr2) {
    var result = [];
    
    for (var i = 0; i < arr1.length; i++) {
        result.push({'owner_id':arr1[i], 'meta_id':arr2[i]});
    }
    return result;
}
function parse_products(values) {    
    var result = {products: []};
    var products = values.split(",");   
    
    for (var i = 0; i < products.length; i++) {
        var pairs = products[i].split("|");
        var temp_product = {};
        for (var j = 0; j < pairs.length; j++) {
            var temp = pairs[j].split("=");
            temp_product[temp[0]] = temp[1];
        }
        result.products.push(temp_product);
    }
    return result;
}

// This should work both there and elsewhere.
function isEmptyObject(obj) {
    for (var key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          return false;
        }
    }
    return true;
}

// catch 404 and forward to err handler
app.use(function(req, res, next) {
    var err = new err('Not Found');
    err.status = 404;
    next(err);
});

// err handlers

// development err handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('err', {
            message: err.message,
            err: err
        });
    });
}

// production err handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('err', {
        message: err.message,
        err: {}
    });
});
var server_ip_address = '127.0.0.1';
/*app.set('port', process.env.PORT || 3000);
var server = app.listen(app.get('port'), server_ip_address, function() {
  console.log('Express server listening on port ' + server.address().port);
});*/

module.exports = app;

