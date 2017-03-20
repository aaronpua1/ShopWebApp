var express = require('express');
var querystring= require('querystring');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var crypto = require('crypto');
var bodyParser = require('body-parser');
var request = require('request');
var config = require('./settings')
var session = require('express-session')
var app = express();
var async = require("async");

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

// Shopify Authentication

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
    }
})

// After the users clicks 'Install' on the Shopify website, they are redirected here
// Shopify provides the app the is authorization_code, which is exchanged for an access token
app.get('/access_token', verifyRequest, function(req, res) {
    if (req.query.shop) {
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
            console.log(body);
            body = JSON.parse(body);
            req.session.access_token = body.access_token;
            console.log(req.session);  
            res.redirect('/');
        })
    }
})
/*
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
                    url: 'https://' + req.query.shop + '.myshopify.com/admin/themes.json?fields=name,id,role',
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
                        key: "Snippets\/simple-upsell.liquid",
                        value: {
                            " "
                        }
                    }
                }
                req_body = JSON.stringify(data);
                
                request({
                    method: "PUT",
                    url: 'https://' + req.query.shop + '.myshopify.com/admin/themes/' + theme_id + '/assets.json',
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
})*/

//                  <td><%= current_offers.metafields[i].value.start_date %></td>
//                  <td><%= current_offers.metafields[i].value.end_date %></td>
app.get('/test-metafields', function(req, res) {
    /*var data = [];
    for (var i = 1; i < 10; i++) {
        var temp = {
            metafield: {
                namespace: "simple_upsells_offers",
                key: "su" + i.toString(),
                value: "offer_name:offerName;offer_title:offerTitle;offer_description:offerDescription;upsell_products:upsellProducts;products:products;offer_type:offerType",
                value_type: "string"
            }
        }
        data.push(temp);
    }
    var data = [{
        metafield: {
            namespace: "simple_upsells_offers",
            key: "su1",
            value: "offer_name:offerName;offer_title:offerTitle;offer_description:offerDescription;upsell_products:upsellProducts;products:products;offer_type:offerType",
            value_type: "string"
        }
    },  {
        metafield: {
            namespace: "simple_upsells_offers",
            key: "su2",
            value: "offer_name:offerName;offer_title:offerTitle;offer_description:offerDescription;upsell_products:upsellProducts;products:products;offer_type:offerType",
            value_type: "string"
        }
    },  {
        metafield: {
            namespace: "simple_upsells_offers",
            key: "su3",
            value: "offer_name:offerName;offer_title:offerTitle;offer_description:offerDescription;upsell_products:upsellProducts;products:products;offer_type:offerType",
            value_type: "string"
        }
    },  {
        metafield: {
            namespace: "simple_upsells_offers",
            key: "su4",
            value: "offer_name:offerName;offer_title:offerTitle;offer_description:offerDescription;upsell_products:upsellProducts;products:products;offer_type:offerType",
            value_type: "string"
        }
    },  {
        metafield: {
            namespace: "simple_upsells_offers",
            key: "su5",
            value: "offer_name:offerName;offer_title:offerTitle;offer_description:offerDescription;upsell_products:upsellProducts;products:products;offer_type:offerType",
            value_type: "string"
        }
    }];
    for (var i = 0; i < data.length; i++) {
        data[i] = JSON.stringify(data[i]);
    }
    var requests = [];
    for (var i = 0; i < data.length; i++) {
        req_body = JSON.stringify(data[i]);
        var temp = {
            method: "POST",
            url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
            headers: {
                'X-Shopify-Access-Token': req.session.access_token,
                'Content-type': 'application/json; charset=utf-8'
            },
            body: req_body
        }
        requests.push(temp);
    }
    data.forEach(function(element) {
        req_body = JSON.stringify(element);
        var temp = {
            method: "POST",
            url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
            headers: {
                'X-Shopify-Access-Token': req.session.access_token,
                'Content-type': 'application/json; charset=utf-8'
            },
            body: req_body
        }
        requests.push(temp);
    });
    var requests = [{
        method: "POST",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        },
        body: data[0]
    },  {
        method: "POST",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        },
        body: data[1]
    },  {
        method: "POST",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        },
        body: data[2]
    },  {
        method: "POST",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        },
        body: data[3]
    },  {
        method: "POST",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        },
        body: data[4]
    }];
    async.map(requests, function(obj, callback) {
        request(obj, function(err, resp, body) {
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
            console.log(err);
            res.write(err.toString());
        } 
        else {            
            console.log(results);
            res.redirect('/');
        }
    });*/
    var data = {
        /*metafield: {
            namespace: "suo",
            key: "su1",
            value: "offer_name:offerName;offer_title:offerTitle;offer_description:offerDescription;upsell_products:upsellProducts;products:products;offer_type:offerType",
            value_type: "string"
        }*/
        metafield: {
            namespace: "suo",
            key: "su2",
            value: {
                offer_id: "offerID",
                offer_name: "offerName",
                offer_title: "offerTitle",
                offer_description: "offerDescription",
                upsell_products: "upsellProducts",
                products: "products",
                offer_type: "offerType"
            },
            value_type: "string"
        }
    }
    req_body = JSON.stringify(data);
    console.log(data);
    console.log(req_body);
    request({
        method: "POST",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        },
        body: req_body
    }, function(err, resp, body){
        if(err)
            return next(err);
        console.log(body);
        body = JSON.parse(body);
        if (body.errs) {
            return res.json(500);
        } 
        res.json(201);
    });
})

// Renders the install/login form
app.get('/install', function(req, res) {
    res.render('app_install', {
        title: 'Shopify Embedded App'
    });
})

// Renders content for a modal
app.get('/modal_content', function(req, res) {
    res.render('modal_content', {
        title: 'Embedded App Modal'
    });
})

// The home page, checks if we have the access token, if not we are redirected to the install page
// This check should probably be done on every page, and should be handled by a middleware
app.get('/', function(req, res) {
    if (req.session.access_token) {
        res.render('index', {
            title: 'Home',
            api_key: config.oauth.api_key,
            shop: req.session.shop
        });
    } else {
        res.redirect('/install');
    }
})

// This is to render the current-offers page that shows all active offers created by store owner 
// This page should display a table from the data retrieved from store metafields Namespace: simple_upsells_offers 
// http://bootsnipp.com/snippets/BDDND
app.get('/current-offers', function(req, res) {
    request.get({
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=100&namespace=simple_upsells_offers',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    }, function(err, resp, body){
        if(err)
            return next(err);
        body = JSON.parse(body);
        res.render('current_offers', {
            title: 'Current Offers', 
            api_key: config.oauth.api_key,
            shop: req.session.shop,
            current_offers: body.metafields
        });
    })
    /*res.render('current_offers', {
        title: 'Current Offers', 
        api_key: config.oauth.api_key,
        shop: req.session.shop,
        //current_offers: body.metafields
    });*/
})

// This is to render the create-offer form page to allow users to customize their offers
app.get('/create-offer', function(req, res) {
    var requests = [{
        method: "GET",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit=250&fields=id,title,vendor,product_type,handle,variants,image',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    }, {
        method: "GET",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/custom_collections.json?limit=250&fields=id,handle,title',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    }];
    
    async.map(requests, function(obj, callback) {
        request(obj, function(err, resp, body) {
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
            return next(err);
        } 
        else {
            var result_collections;
            var result_products;
            
            for (var i = 0; i < results.length; i++) {
                if(results[i].hasOwnProperty('products')){
                    result_products = results[i];
                }
                else {
                    result_collections = results[i];
                }
            }
            
            console.log(results);
            res.render('create_offer', {
                title: 'Create Your Offer', 
                api_key: config.oauth.api_key,
                shop: req.session.shop,
                collection_selections: result_collections,
                product_selections: result_products
            });
        }
    });
})
/*
app.post('/create-offer', function(req, res) {
    async.waterfall([
        function(callback) {
            request.get({
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=250&namespace=simple_upsells_offers' + '&key=' + req.body.offer_name,
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
                console.log(body);
                body = JSON.parse(body);
                callback(null, body.metafields);
            });
        },
        function(metafields, callback) {
            if (metafields.length > 0) {
                var id = metafields[0].id.toString();
                var data = {
                    metafield: {
                        id: metafields[0].id,
                        value: {
                            offer_id: id,
                            offer_name: req.body.offer_name,
                            offer_title: req.body.offer_title,
                            offer_description: req.body.offer_description,
                            upsell_products: req.body.upsell_products,
                            products: req.body.products,
                            offer_type: req.body.offer_type
                        },
                        value_type: string
                    }
                }
                req_body = JSON.stringify(data);
                console.log(data);
                console.log(req_body);
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
                    console.log(body);
                    body = JSON.parse(body);
                    callback(null, 'done');
                });
            }
            else {
                var data1 = {
                    metafield: {
                        namespace: simple_upsells_offers,
                        key: req.body.offer_name,
                        value: {
                            offer_id: 0,
                            offer_name: req.body.offer_name,
                            offer_title: req.body.offer_title,
                            offer_description: req.body.offer_description,
                            upsell_products: req.body.upsell_products,
                            products: req.body.products,
                            offer_type: req.body.offer_type
                        },
                        value_type: string
                    }
                }
                req_body = JSON.stringify(data1);
                console.log(data1);
                console.log(req_body);
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
                    console.log(body1);
                    body = JSON.parse(body1);
                    
                    var id = body1.metafield.id.toString();
                    var data2 = {
                        metafield: {
                            id: body1.metafield.id,
                            value: {
                                offer_id: id,
                                offer_name: req.body.offer_name,
                                offer_title: req.body.offer_title,
                                offer_description: req.body.offer_description,
                                upsell_products: req.body.upsell_products,
                                products: req.body.products,
                                offer_type: req.body.offer_type
                            },
                            value_type: string
                        }
                    }
                    req_body = JSON.stringify(data2);
                    console.log(data2);
                    console.log(req_body);
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
                        console.log(body2);
                        body2 = JSON.parse(body2);
                        callback(null, 'done');
                    });
                });
            }
        }
    ],
    function(err, result) {
        if (err) {
            console.log(err);
            return res.json(500);
        }    
        res.redirect('/');
    });
})*/

// This is used to post form data from the create-offer page to the store metafields Namespace: simple_upsells_offers 
// I will be using a product-list array contained within a json object
// Might need logic to check if key/value of existing is being edited
// if page has offer already has metafield id do put else do post*
app.post('/create-offer', function(req, res) {
    request.get({
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json?limit=250&namespace=simple_upsells_offers' + '&key=' + req.body.offer_name,
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    }, function(err, resp, body){
        if(err)
            return next(err);
        body = JSON.parse(body);
        
        if (body.metafields.length > 0) {
            var id = body.metafields[0].id.toString();
            var data = {
                metafield: {
                    id: body.metafields[0].id,
                    value: {
                        offer_name: req.body.offer_name,
                        offer_title: req.body.offer_title,
                        offer_description: req.body.offer_description,
                        upsell_products: req.body.upsell_products,
                        products: req.body.products,
                        offer_type: req.body.offer_type
                    },
                    value_type: string
                }
            }
            req_body = JSON.stringify(data);
            console.log(data);
            console.log(req_body);
            
            request({
                method: "PUT",
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + id + '.json',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token,
                    'Content-type': 'application/json; charset=utf-8'
                },
                body: req_body
            }, function(err, resp, body){
                if(err)
                    return next(err);
                console.log(body);
                body = JSON.parse(body);
                if (body.errs) {
                    return res.json(500);
                } 
                res.json(201);
            });
        }
        else {
            var data = {
                metafield: {
                    namespace: simple_upsells_offers,
                    key: req.body.offer_name,
                    value: {
                        offer_name: req.body.offer_name,
                        offer_title: req.body.offer_title,
                        offer_description: req.body.offer_description,
                        upsell_products: req.body.upsell_products,
                        products: req.body.products,
                        offer_type: req.body.offer_type
                    },
                    value_type: string
                }
            }
            req_body = JSON.stringify(data);
            console.log(data);
            console.log(req_body);
            request({
                method: "POST",
                url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields.json',
                headers: {
                    'X-Shopify-Access-Token': req.session.access_token,
                    'Content-type': 'application/json; charset=utf-8'
                },
                body: req_body
            }, function(err, resp, body){
                if(err)
                    return next(err);
                console.log(body);
                body = JSON.parse(body);
                if (body.errs) {
                    return res.json(500);
                } 
                res.json(201);
            });
        }
    });
})

// This is used to allow store owners to delete their offers from the store metafields Namespace: simple_upsells_offers
app.post('/delete-offer', function(req, res) {
    request({
        method: "DELETE",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.body.id + '.json',
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
            return res.json(500);
        } 
        res.json(201);
    });
})

// This is used to render the create-offer page with selected offer metafield data contained within it so the user can edit it.
app.get('/update-offer', function(req, res) {
    var requests = [{
        method: "GET",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit=250&fields=id,title,vendor,product_type,handle,variants,image',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    }, {
        method: "GET",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/custom_collections.json?limit=250&fields=id,handle,title',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    },  {
        method: "GET", 
        url: 'https://' + req.session.shop + '.myshopify.com/admin/metafields/' + req.body.id + '.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        }
    }];

    async.map(requests, function(obj, callback) {
        request(obj, function(err, resp, body) {
            if (!err && resp.statusCode == 200) {
                var body = JSON.parse(body);
                callback(null, body);
            }
            else {
                callback(err || resp.statusCode);
            }
        });
    },  function(err, results) {
        if (err) {
            return next(err);
        } 
        else {
            var result_collections;
            var result_products;
            var result_values;
            
            for (var i = 0; i < results.length; i++) {
                if(results[i].hasOwnProperty('products')){
                    result_products = results[i];
                }
                else if (results[i].hasOwnProperty('metafield')) {
                    result_values = results[i];
                }
                else {
                    result_collections = results[i];
                }
            }
            
            console.log(results);
            res.render('create_offer', {
                title: 'Create Your Offer', 
                api_key: config.oauth.api_key,
                shop: req.session.shop,
                custom_collections: result_collections,
                products: result_products,
                values: result_values
            });
        }
    });
})

// This is used to filter through all products so that the store owner can find the products they want to include in the product-list array 
app.get('/search-products', function(req, res) {
    var next, previous, page, limit;
    page = req.query.page ? ~~req.query.page:1;
    limit = req.query.limit;
    
    next = page + 1;
    previous = page == 1 ? page : page - 1;
    
    request.get({
        url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit='+ limit +'&page=' + page,
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    }, function(err, resp, body){
        if(err)
            return next(err);
        body = JSON.parse(body);
        res.render('products', {
            title: 'Products', 
            api_key: config.oauth.api_key,
            shop: req.session.shop,
            next: next,
            previous: previous,
            products: body.products
        });
    }) 
})

app.get('/upsell-settings', function(req, res) {
    res.render('upsell_settings', {
        title: 'Upsell Settings', 
        api_key: config.oauth.api_key,
        shop: req.session.shop,
    });
})

app.get('/add_product', function(req, res) {
    res.render('add_product', {
        title: 'Add A Product', 
        api_key: config.oauth.api_key,
        shop: req.session.shop,
    });
})

app.get('/products', function(req, res) {
    var next, previous, page;
    page = req.query.page ? ~~req.query.page:1;

    next = page + 1;
    previous = page == 1 ? page : page - 1;

    request.get({
        url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json?limit=5&page=' + page,
        headers: {
            'X-Shopify-Access-Token': req.session.access_token
        }
    }, function(err, resp, body){
        if(err)
            return next(err);
        body = JSON.parse(body);
        res.render('products', {
            title: 'Products', 
            api_key: config.oauth.api_key,
            shop: req.session.shop,
            next: next,
            previous: previous,
            products: body.products
        });
    })  
})

app.post('/products', function(req, res) {
    data = {
     product: {
            title: req.body.title,
            body_html: req.body.body_html,
            images: [
                {
                    src: req.body.image_src
                }
            ],
            vendor: "Vendor",
            product_type: "Type"
        }
    }
    req_body = JSON.stringify(data);
    console.log(data);
    console.log(req_body);
    request({
        method: "POST",
        url: 'https://' + req.session.shop + '.myshopify.com/admin/products.json',
        headers: {
            'X-Shopify-Access-Token': req.session.access_token,
            'Content-type': 'application/json; charset=utf-8'
        },
        body: req_body
    }, function(err, resp, body){
        if(err)
            return next(err);
        console.log(body);
        body = JSON.parse(body);
        if (body.errs) {
            return res.json(500);
        } 
        res.json(201);
    })  
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


/*
https://www.w3schools.com/js/tryit.asp?filename=tryjs_json_parse
<!DOCTYPE html>
<html>
<body>

<h2>Create Object from JSON String</h2>

<p id="demo"></p>

<script>
var text = '{"employees":[' +
'{"firstName":"John","lastName":"Doe" },' +
'{"firstName":"Anna","lastName":"Smith" },' +
'{"firstName":"Peter","lastName":"Jones" }]}';

var text1 = '{"products":[{"id":"8861586760","title":"food"}]}';
var text2 = '{"custom_collections":[{"id":"419695560","title":"drink"}]}';

var obj = [];
obj.push(JSON.parse(text1));
obj.push(JSON.parse(text2));

//obj = JSON.parse(text);
document.getElementById("demo").innerHTML = obj[0].products[0].title;

if(obj[0].hasOwnProperty('products')){
    document.getElementById("demo").innerHTML = obj[0].products[0].title;
}

//obj.employees[1].firstName + " " + obj.employees[1].lastName;
</script>

</body>
</html>
*/