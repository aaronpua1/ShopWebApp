jQuery(function($){
     
  /*  app proxy in jQuery*/			 
  var base_urlc = window.location.hostname; //grab shop url
  var window_width = $(window).width();  //save width

  if ($('#custom_app').length > 0 ){   
      $('#custom_app').css({'width':'100%'}); // set container width
      var width_canvas = $('#custom_app').width(); //get container width
      var product_id = $('#custom_app').data('product'); //get product id 
    /* call Shop to get a json list of product parameters */
      $.get( '/products/' + product_id + '.json',
            
          function(xhr,status){
              
              data_params = JSON.stringify(xhr); //save parameters
              data_param = JSON.parse(data_params); //parse parameters
              var product_id = data_param.product.id; //set product.id
              //var img_lrg = Shopify.resizeImage(data_param.product.images[0].src, 'large'); //resize image
              /* create iframe with src set to the app proxy url as src to call. Notice that /apps/customize can be changed but needs to match your proxy settings*/
              //var target_html = '<iframe id="customized-iframe" src="//' + base_urlc  +  '/apps/customize?shop=' + Shopify.shop +  '&product_id=' + product_id +  '&image=' + img_lrg + '" frameborder="0" scrolling="no" style="display:block;" width="100%" />';
              var target_html = '<iframe id="customized-iframe" src="//' + base_urlc  +  '/apps/simple-upsells/template?shop=' + Shopify.shop +  '&product_id=' + product_id + '" frameborder="0" scrolling="no" style="display:block;" width="100%" />';
              $('#custom_app').html(target_html); //write iframe to #custom_app html
      });
  }
}