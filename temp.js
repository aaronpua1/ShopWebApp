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
                console.log("GET RESPONSE: " + body);
                //body = JSON.parse(body);
                var values = JSON.parse(JSON.stringify(parse_values(body.metafield.value)));
                values = JSON.parse(JSON.stringify(parse_products(values.products)));
                callback(null, values);
            });
        },
        function(values, callback) { //go thru each product here to get metafield id
            var requests = [];
            for (var i = 0; i < values.products.length; i++) {
                var temp_request = {
                    method: "GET",
                    url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values.products[i].id + '/metafields.json',
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
                //console.log(result);
                callback(null, values, result);
            });
        },
        function(values, metafields, callback) {
            var requests = [];
            for (var i = 0; i < values.products.length; i++) {
                for (var j = 0; j < metafields[i].metafields.length; j++) {
                    var temp_request = {
                        method: "DELETE",
                        url: 'https://' + req.session.shop + '.myshopify.com/admin/products/' + values.products[i].id + '/metafields/' + metafields[i].metafields[j].id + '.json',
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
                //console.log(result);
                callback(null, 'done');
            });
        }
    ],
    function(err, resp, body){
        if(err)
            return next(err);
        console.log(body);
        body = JSON.parse(body);
        if (body.errs) {
            return res.json(404);
        } 
        res.json(200);
    });
        

    
    
    
<!DOCTYPE html>
<html>
<head>
	<script src="https://cdn.shopify.com/s/assets/external/app.js"></script>
	<script type="text/javascript">
	ShopifyApp.init({
		apiKey: '<%= api_key %>',
		shopOrigin: 'https://<%= shop %>.myshopify.com'
	});
	</script>
    <link href="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.0/css/bootstrap.min.css" rel="stylesheet" type="text/css">
    <link rel="stylesheet" type="text/css" href="http://cdnjs.cloudflare.com/ajax/libs/prettify/r298/prettify.min.css">
    <link rel="stylesheet" type="text/css" href="/stylesheets/bootstrap-duallistbox.css">
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.0.0/jquery.min.js"></script>
    <script src="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.0/js/bootstrap.min.js"></script>
    <script src="http://cdnjs.cloudflare.com/ajax/libs/prettify/r298/run_prettify.min.js"></script>
    <script src="/javascripts/jquery.bootstrap-duallistbox.js"></script>
    <!-- Latest compiled and minified CSS -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-select/1.12.2/css/bootstrap-select.min.css">

    <!-- Latest compiled and minified JavaScript -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-select/1.12.2/js/bootstrap-select.min.js"></script>

    <!-- (Optional) Latest compiled and minified JavaScript translation files -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-select/1.12.2/js/i18n/defaults-*.min.js"></script>
	<link rel='stylesheet' href='/stylesheets/style.css' />
    <link async href="http://fonts.googleapis.com/css?family=Advent%20Pro" data-generated="http://enjoycss.com" rel="stylesheet" type="text/css"/>
	<title><%= title %></title>
</head>
<body>
  <script type="text/javascript">
    ShopifyApp.ready(function(){
        /*$(".dual-box").bootstrapDualListbox({
            nonSelectedListLabel: 'Non-selected',
            selectedListLabel: 'Selected',
            moveAllLabel: 'Move all',
            removeAllLabel: 'Remove all',
            infoText: false,
            preserveSelectionOnMove: 'moved',
            moveOnSelect: true,
            filterOnValues: true,
            selectorMinimalHeight: 100
        });*/
        $("#upsell-dual-box").bootstrapDualListbox({
            nonSelectedListLabel: 'Non-selected',
            selectedListLabel: 'Selected',
            moveAllLabel: 'Move all',
            removeAllLabel: 'Remove all',
            infoText: false,
            preserveSelectionOnMove: 'moved',
            moveOnSelect: true,
            filterOnValues: true,
            selectorMinimalHeight: 100
        });
        
        $("#product-dual-box").bootstrapDualListbox({
            nonSelectedListLabel: 'Non-selected',
            selectedListLabel: 'Selected',
            moveAllLabel: 'Move all',
            removeAllLabel: 'Remove all',
            infoText: false,
            preserveSelectionOnMove: 'moved',
            moveOnSelect: true,
            filterOnValues: true,
            selectorMinimalHeight: 100
        });  
        
        $( "#btn-upsell-filter" ).click(function( event ) {
            //"(.*?)title:(.*?)value(.*?);vendor:(.*?);upsell_product_type:(.*?)"
            var result = "(.*?)";
            /*
            if ($("#upsell_custom_collection").val() !== "none") {
                $("#bootstrap-duallistbox-nonselected-list_upsell-dual-box").empty();
                $("#bootstrap-duallistbox-nonselected-list_upsell-dual-box").append(
                    '<%for(var i = 0; i < product_selections.products.length; i++) { %>' + 
                        '<option value="id=<%= product_selections.products[i].id %>,handle=<%= product_selections.products[i].handle %>,title=<%= product_selections.products[i].title %>,product_type=<%= product_selections.products[i].product_type %>,vendor=<%= product_selections.products[i].vendor %>"><%= product_selections.products[i].title %></option>'+
                    '<% } %>'
                );
            }*/
            if ($("#upsell_title").val() !== "") {
                result += "title:(.*?)" + $("#upsell_title").val() + "(.*?);";
            }
            else {
                result += "title:(.*?),";
            }
            if ($("#upsell_vendor").val() !== "none") {
                result += "vendor:" + $("#upsell_vendor").val() + ";";
            }
            else {
                result += "vendor:(.*?);"
            }
            if ($("#upsell_type").val() !== "none") {
                result += "product_type:" + $("#upsell_type").val();
            }
            else {
                result += "product_type:(.*?)";
            }
            $("#upsell-dual-box").bootstrapDualListbox('setNonSelectedFilter', result, true);
        });

        $( "#btn-upsell-reset" ).click(function( event ) {
            $("#upsell-dual-box").bootstrapDualListbox('setNonSelectedFilter', '', true);
        });
        
        $( "#btn-product-filter" ).click(function( event ) {
            if ($("#product_title").val() !== "") {
                result += "title:(.*?)" + $("#product_title").val() + "(.*?);";
            }
            else {
                result += "title:(.*?);";
            }
            if ($("#product_vendor").val() !== "none") {
                result += "vendor:" + $("#product_vendor").val() + ";";
            }
            else {
                result += "vendor:(.*?);"
            }
            if ($("#product_type").val() !== "none") {
                result += "product_type:" + $("#product_type").val();
            }
            else {
                result += "product_type:(.*?)";
            }
            $("#product-dual-box").bootstrapDualListbox('setNonSelectedFilter', result, true);
        });

        $( "#btn-product-reset" ).click(function( event ) {
            $("#product-dual-box").bootstrapDualListbox('setNonSelectedFilter', '', true);
        });
        /*
        $( "#create-offer" ).click(function( event ) {
            var name = $('#offer_name').val();
            var title = $('#offer_title').val();
            var description = $('#offer_description').val();
            var upsells = $('#upsell-dual-box').val();
            var products = $('#product-dual-box').val();
            //var type = 
        });*/
    });
  </script>
  <div class="container">
    <div class="row">
      <hr>
      <div class="bg-primary">
        <p class="h1">Create Your Offer</p>
      </div>
      <hr>
      <form id="offer-form" method="POST" action="/create-offer">
        <div class="form-group col-md-12 bg-primary h4">
          <div class="control-group">
            <div class="controls">
              <p class="control-label" for="form-steps">Step 1: Setup Offer</p>
            </div>
          </div>
        </div>
        <div class="panel panel-success">
          <div class="panel-body">
            <div class="form-group col-md-12 offer-input-groups">
              <div class="control-group">
                <label class="control-label" for="offer_name">Offer Name</label>
                <div class="controls">
                  <input class="form-control" id="offer_name" name="offer_name" placeholder="Internal use only" required="" style="width: 49%;" type="text">
                </div>
              </div>
            </div>
            <div class="form-group col-md-12 offer-input-groups">
              <div class="control-group">
                <label class="control-label" for="offer_title">Offer Title</label>
                <div class="controls">
                  <input class="form-control" id="offer_title" name="offer_title" placeholder="Bold font that shows up at the top of the offer" required="" style="width: 49%;" type="text">
                </div>
              </div>
            </div>
            <div class="form-group col-md-12 offer-input-groups">
              <div class="control-group">
                <label class="control-label" for="offer_description">Offer Description</label>
                <div class="controls">
                  <textarea class="form-control" cols="65" id="offer_description" name="offer_description" required="" rows="10" style="width: 49%;">Briefly describe what your offer means and how it works</textarea>
                </div>
              </div>
            </div>
          </div>
        </div>
        <hr>
        <div class="form-group col-md-12 bg-primary h4">
          <div class="control-group">
            <div class="controls">
              <p class="control-label" for="form-steps">Step 2: Select product(s) to upsell</p>
            </div>
          </div>
        </div>
        <div class="panel panel-success">
          <div class="panel-body">
            <div class="form-group col-md-12 offer-input-groups">
              <div class="control-group">
                <label class="control-label" for="upsell_title">Filter by product title</label>
                <div class="controls">
                  <input class="form-control" id="upsell_title" name="upsell_title" placeholder="Enter product title" style="width: 49%;" type="text">
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <label class="control-label" for="upsell_custom_collection">Filter by custom collection</label>
                <div class="controls">
                  <select class="selectpicker" data-width="49%" id="upsell_custom_collection" name="upsell_custom_collection" style="display: none;">
                    <option value="none">
                      Filter by custom collection
                    </option><%for(var i = 0; i < collection_selections.custom_collections.length; i++) { %>
                    <option value="<%= collection_selections.custom_collections[i].title %>">
                      <%= collection_selections.custom_collections[i].title %>
                    </option><%} %>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <label class="control-label" for="upsell_vendor">Filter by vendor</label>
                <div class="controls">
                  <select class="selectpicker" data-width="49%" id="upsell_vendor" name="upsell_vendor" style="display: none;">
                    <option value="none">
                      Filter by vendor
                    </option><%for(var i = 0; i < product_selections.products.length; i++) { %>
                    <option value="<%= product_selections.products[i].vendor %>">
                      <%= product_selections.products[i].vendor %>
                    </option><%} %>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <label class="control-label" for="upsell_product_type">Filter by product type</label>
                <div class="controls">
                  <select class="selectpicker" data-width="49%" id="upsell_type" name="upsell_type" style="display: none;">
                    <option value="none">
                      Filter by product type
                    </option><%for(var i = 0; i < product_selections.products.length; i++) { %>
                    <option value="<%= product_selections.products[i].product_type %>">
                      <%= product_selections.products[i].product_type %>
                    </option><%} %>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <div class="container">
                  <div class="row">
                    <button type="button" id="btn-upsell-filter" class="btn btn-primary">Filter</button>
                    <button type="button" id="btn-upsell-reset" class="btn btn-danger">Reset</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <select class="dual-box" id="upsell-dual-box" multiple="multiple" name="upsell_dual_box" size="10">
                <%for(var i = 0; i < product_selections.products.length; i++) { %>
                <option value="id:<%= product_selections.products[i].id %>;title:<%= product_selections.products[i].title %>;handle:<%= product_selections.products[i].handle %>;product_type:<%= product_selections.products[i].product_type %>;vendor:<%= product_selections.products[i].vendor %>">
                  <%= product_selections.products[i].title %>
                </option><% } %>
                <option value="option1">
                  Option 1
                </option>
                <option value="option2">
                  Option 2
                </option>
                <option selected="selected" value="option3">
                  Option 3
                </option>
                <option value="option4">
                  Option 4
                </option>
                <option value="option5">
                  Option 5
                </option>
                <option selected="selected" value="option6">
                  Option 6
                </option>
                <option value="option7">
                  Option 7
                </option>
                <option value="option8">
                  Option 8
                </option>
                <option value="option9">
                  Option 9
                </option>
                <option value="option0">
                  Option 10
                </option>
                <option value="option0">
                  Option 11
                </option>
                <option value="option0">
                  Option 12
                </option>
                <option value="option0">
                  Option 13
                </option>
                <option value="option0">
                  Option 14
                </option>
                <option value="option0">
                  Option 15
                </option>
                <option value="option0">
                  Option 16
                </option>
                <option value="option0">
                  Option 17
                </option>
                <option value="option0">
                  Option 18
                </option>
                <option value="option0">
                  Option 19
                </option>
                <option value="option0">
                  Option 20
                </option>
              </select>
            </div>
          </div>
        </div>
        <hr>
        <div class="form-group col-md-12 bg-primary h4">
          <div class="control-group">
            <div class="controls">
              <p class="control-label" for="form-steps">Step 3: Select Products to Place Offer</p>
            </div>
          </div>
        </div>
        <div class="panel panel-success">
          <div class="panel-body">
            <div class="form-group col-md-12 offer-input-groups">
              <div class="control-group">
                <label class="control-label" for="product_title">Filter by product title</label>
                <div class="controls">
                  <input class="form-control" id="product_title" name="product_title" placeholder="Enter product title" style="width: 49%;" type="text">
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <label class="control-label" for="product_custom_collection">Filter by custom collection</label>
                <div class="controls">
                  <select class="selectpicker" data-width="49%" id="product_custom_collection" name="product_custom_collection" style="display: none;">
                    <option value="none">
                      Filter by custom collection
                    </option><%for(var i = 0; i < collection_selections.custom_collections.length; i++) { %>
                    <option value="<%= collection_selections.custom_collections[i].title %>">
                      <%= collection_selections.custom_collections[i].title %>
                    </option><%} %>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <label class="control-label" for="product_vendor">Filter by vendor</label>
                <div class="controls">
                  <select class="selectpicker" data-width="49%" id="product_vendor" name="product_vendor" style="display: none;">
                    <option value="none">
                      Filter by vendor
                    </option><%for(var i = 0; i < product_selections.products.length; i++) { %>
                    <option value="<%= product_selections.products[i].vendor %>">
                      <%= product_selections.products[i].vendor %>
                    </option><%} %>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <label class="control-label" for="product_type">Filter by product type</label>
                <div class="controls">
                  <select class="selectpicker" data-width="49%" id="product_type" name="product_type" style="display: none;">
                    <option value="none">
                      Filter by product type
                    </option><%for(var i = 0; i < product_selections.products.length; i++) { %>
                    <option value="<%= product_selections.products[i].product_type %>">
                      <%= product_selections.products[i].product_type %>
                    </option><%} %>
                  </select>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <div class="control-group">
                <div class="container">
                  <div class="row">
                    <button type="button" id="btn-product-filter" class="btn btn-primary">Filter</button>                    
                    <button type="button" id="btn-product-reset" class="btn btn-danger">Reset</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="form-group col-md-12">
              <select class="dual-box" id="product-dual-box" multiple="multiple" name="product_dual_box" size="10">
                <%for(var i = 0; i < product_selections.products.length; i++) { %>
                <option value="id:<%= product_selections.products[i].id %>;title:<%= product_selections.products[i].title %>;handle:<%= product_selections.products[i].handle %>;product_type:<%= product_selections.products[i].product_type %>;vendor:<%= product_selections.products[i].vendor %>">
                  <%= product_selections.products[i].title %>
                </option><%} %>
                <option value="option1">
                  Option 1
                </option>
                <option value="option2">
                  Option 2
                </option>
                <option selected="selected" value="option3">
                  Option 3
                </option>
                <option value="option4">
                  Option 4
                </option>
                <option value="option5">
                  Option 5
                </option>
                <option selected="selected" value="option6">
                  Option 6
                </option>
                <option value="option7">
                  Option 7
                </option>
                <option value="option8">
                  Option 8
                </option>
                <option value="option9">
                  Option 9
                </option>
                <option value="option0">
                  Option 10
                </option>
                <option value="option0">
                  Option 11
                </option>
                <option value="option0">
                  Option 12
                </option>
                <option value="option0">
                  Option 13
                </option>
                <option value="option0">
                  Option 14
                </option>
                <option value="option0">Option 15</option>
                <option value="option0">Option 16</option>
                <option value="option0">Option 17</option>
                <option value="option0">Option 18</option>
                <option value="option0">Option 19</option>
                <option value="option0">Option 20</option>
              </select>
            </div>
          </div>
        </div>
        <div class="form-group col-md-12">
          <div class="control-group confirm-btn">
            <label class="control-label" for="create-offer"></label>
            <div class="controls">
              <button class="btn btn-primary" id="create-offer" name="create-offer" type="submit" form="offer-form" value="Create">Create</button>
            </div>
          </div>
        </div>
      </form>
    </div>
  </div>
<style>
.form-group .selectpicker{
    margin-bottom: 3px;
}

.offer-input-groups .form-control{
    margin-bottom: 3px;
}

h2.bg-success{
    padding: 15px;
}

.required-lbl{
    color: red;
}

p[for="form-steps"]{
    display: inline;
    float: left;
    margin:0px 45px 0px 0px;
}

.card-expiry{
    padding-left: 0px;
}

.confirm-btn{
    float:right;
}

.bg-primary{
    padding: 10px;
    margin-bottom: 15px;
}

label{
    margin-bottom: 0px;
}

.panel-success{
    background-color: #dcdcdc;
}


</style>
</body>
</body>
</html>