var express = require('express');
var router = express.Router();
var dal = require('../data/dal_comp_financial_history')
var HttpStatus = require('http-status-codes')
var regression = require('regression');

/*************************************************************************************** 
  Perform calculation over a set of financial 
  results to determine if they had occurred all in 
  an one year of difference.
*****************************************************************************************/
var have_financial_results_one_year_diff_each_other = function (values, min_req_itens) {
  var previous_year = 0
  var current_year = 0

  if (values.length < min_req_itens) {
    return false
  }

  values.sort(function (a, b) {
    return new Date(a[0]) - new Date(b[0]);
  });

  for (var index = 0; index < values.length; index++) {
    var current_year = new Date(values[index][0]).getFullYear()
    var years_diff = (previous_year - current_year)

    if ((index == 1) && (years_diff > 2)) {
      return false
    } else if ((index > 1) && (years_diff > 1)) {
      return false
    }

    previous_year = current_year
  }

  return true
}

/****************************************************************** 
  Perform linear regression to define 
  wether a set o values indicates growth or loss.
********************************************************************/
var are_values_indicating_growth = function (values, min_req_itens) {
  var arr_values = []
  var reg_result = null

  if (values.length < min_req_itens) {
    return false
  }

  values.sort(function (a, b) {
    return new Date(a[0]) - new Date(b[0]);
  });

  for (var index = 0; index < values.length; index++) {
    arr_values.push([index, values[index][1]])
  }

  var reg_result = regression.linear(arr_values)
  var predicted_value = reg_result.predict((values.length + 1)) //Predicts the result for one more year 

  if (predicted_value[1] < reg_result.points[0][1]) {
    return false
  } else {
    return true
  }
}

router.get('/', function (req, res, next) {
  if ((Object.keys(req.query).length === 0) || (Object.keys(req.query).indexOf("code") < 0)) {
    res.status(HttpStatus.EXPECTATION_FAILED).send("Stock code not informed")
  }

  new dal().get(req.query["code"], function (data) {
    res.status(HttpStatus.OK).send(data);
  }, function (data) {
    res.status(HttpStatus.METHOD_FAILURE).send(data)
  });
});

router.get('/stats/', function (req, res, next) {
  var qry_str_param_stock_code = "code"
  var qry_str_param_min_years_required = "min_required_years"
  
  if ((Object.keys(req.query).length === 0) || (Object.keys(req.query).indexOf(qry_str_param_stock_code) < 0)) {
    res.status(HttpStatus.EXPECTATION_FAILED).send("Stock code not informed")
    return
  }

  if ((Object.keys(req.query).length === 0) || (Object.keys(req.query).indexOf(qry_str_param_min_years_required) < 0)) {
    res.status(HttpStatus.EXPECTATION_FAILED).send("Minimum amout of years required to compare financial results were not informed")
    return
  }else if(Number.isNaN(req.query[qry_str_param_min_years_required])){
    res.status(HttpStatus.BAD_REQUEST).send("Minimum amout of years required to compare financial results must be an integer value")
    return
  }

  var stock_code = req.query[qry_str_param_stock_code]
  var min_allowed_years_fin_result = Number(req.query[qry_str_param_min_years_required])

  new dal().get(stock_code, function (data) {
    //Performing stats logic
    var result_obj = {
      has_dividend_been_constantly_shared_lst_4yrs: null,
      is_dividend_growing_over_years: null,
      is_net_profit_growing_over_years: null,
    }

    var arr_values_cash_flow_dividend = []
    var arr_values_cash_flow_net_profit = []

    if (data != null) {
      if (("cash_flow" in data) && (data.cash_flow != null)) {
        for (index = 0; index < data.cash_flow.length; index++) {
          if (("description" in data.cash_flow[index]) && ("value" in data.cash_flow[index]) && ("date" in data.cash_flow[index])) {
            if (String(data.cash_flow[index].description).toLowerCase() === "dividendos pagos") {
              arr_values_cash_flow_dividend.push([data.cash_flow[index].date, Number(data.cash_flow[index].value)])
            } else if (String(data.cash_flow[index].description).toLowerCase() === "lucro líquido") {
              arr_values_cash_flow_net_profit.push([data.cash_flow[index].date, Number(data.cash_flow[index].value)])
            }
          }
        }

        result_obj.has_dividend_been_constantly_shared_lst_4yrs = have_financial_results_one_year_diff_each_other(arr_values_cash_flow_dividend, min_allowed_years_fin_result)
        result_obj.is_dividend_growing_over_years = are_values_indicating_growth(arr_values_cash_flow_dividend, min_allowed_years_fin_result)
        result_obj.is_net_profit_growing_over_years = are_values_indicating_growth(arr_values_cash_flow_net_profit, min_allowed_years_fin_result)
      }
    }

    res.status(HttpStatus.OK).send(result_obj);
  }, function (data) {
    res.status(HttpStatus.METHOD_FAILURE).send(data)
  });
});

router.post('/', function (req, res, next) {
  if (!req.body) {
    res.status(HttpStatus.PARTIAL_CONTENT).send("Body message is required")
    return
  }

  if (!req.body.code) {
    res.status(HttpStatus.PARTIAL_CONTENT).send("Stock code is required")
    return
  }

  // Adding new history to the database
  new dal().add(req.body, function (data) {
    res.status(HttpStatus.OK).send(data)
  }, function (data) {
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(data)
  })
});

module.exports = router;