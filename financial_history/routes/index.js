var express = require('express');
var router = express.Router();
var dal = require('../data/dal_comp_financial_history')
var HttpStatus = require('http-status-codes')
var regression = require('regression');

const CONST_CASH_FLOW_HISTORY_DESC = "Fluxo de Caixa"
const CONST_BALANCE_SHEET_HISTORY_DESC = "Balanço"
const CONST_QRY_STR_CODE = "code"
const CONST_QRY_STR_MIN_REQ_YEARS = "min_required_years"
const CONST_DESCRIPTION_FIELD = "description"
const CONST_PAYED_DIVIDENDS_FIELD = "Dividendos Pagos"
const CONST_NET_PROFIT_FIELD = "Lucro Líquido"
const CONST_NET_WORTH_FIELD = "Patrimônio Líquido Total"
const CONST_TOTAL_LIABILITIES_FIELD = "Total de Passivos"
const CONST_PERIODS_FIELD = "periods"
const CONST_VALUE_FIELD = "value"
const CONST_DATE_FIELD = "date"
const CONST_ROW_FIELD = "rows"
const CONST_HISTORY_FIELD = "history"

var get_history_values = function (values, history, row) {
  var return_obj = []

  if (values == undefined || values == null || !(CONST_HISTORY_FIELD in values) || values.history.length < 0) {
    return return_obj
  }

  for (var index_hist = 0; index_hist < values.history.length; index_hist++) {
    if ((CONST_DESCRIPTION_FIELD in values.history[index_hist]) && (String(values.history[index_hist].description).toLowerCase() == String(history).toLowerCase()) && (CONST_PERIODS_FIELD in values.history[index_hist])) {
      for (var index_period = 0; index_period < values.history[index_hist].periods.length; index_period++) {
        if (!(CONST_ROW_FIELD in values.history[index_hist].periods[index_period]) || !(CONST_DATE_FIELD in values.history[index_hist].periods[index_period])) {
          continue
        }

        for (var index_row = 0; index_row < values.history[index_hist].periods[index_period].rows.length; index_row++) {
          if (!(CONST_DESCRIPTION_FIELD in values.history[index_hist].periods[index_period].rows[index_row]) || !(CONST_VALUE_FIELD in values.history[index_hist].periods[index_period].rows[index_row])) {
            continue
          }

          if (String(values.history[index_hist].periods[index_period].rows[index_row].description).toLowerCase() == String(row).toLowerCase()) {
            return_obj.push([values.history[index_hist].periods[index_period].date, values.history[index_hist].periods[index_period].rows[index_row].value])
          }
        }
      }
    }
  }

  return return_obj
}

/*************************************************************************************** 
  Perform calculation over a set of financial 
  results to determine if they had occurred all in 
  an one year of difference.
*****************************************************************************************/
var have_financial_results_issued_year_after_year = function (values, min_req_itens) {
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

  if (predicted_value != null &&
    predicted_value.length > 1 &&
    reg_result != null &&
    reg_result.points != null &&
    reg_result.points.length > 0 &&
    reg_result.points[0].length > 1) {
    if (predicted_value[1] < reg_result.points[0][1]) {
      return false
    } else {
      return true
    }
  } else {
    return false
  }
}

router.get('/', function (req, res, next) {
  if ((Object.keys(req.query).length === 0) || (Object.keys(req.query).indexOf(CONST_QRY_STR_CODE) < 0)) {
    res.status(HttpStatus.EXPECTATION_FAILED).send("Stock code not informed")
  }

  new dal().get(req.query[CONST_QRY_STR_CODE], function (data) {
    res.status(HttpStatus.OK).send(data);
  }, function (data) {
    res.status(HttpStatus.METHOD_FAILURE).send(data)
  });
});

router.get('/stats/', function (req, res, next) {
  if ((Object.keys(req.query).length === 0) || (Object.keys(req.query).indexOf(CONST_QRY_STR_CODE) < 0)) {
    res.status(HttpStatus.EXPECTATION_FAILED).send("Stock code not informed")
    return
  }

  if ((Object.keys(req.query).length === 0) || (Object.keys(req.query).indexOf(CONST_QRY_STR_MIN_REQ_YEARS) < 0)) {
    res.status(HttpStatus.EXPECTATION_FAILED).send("Minimum amout of years required to compare financial results were not informed")
    return
  } else if (Number.isNaN(req.query[CONST_QRY_STR_MIN_REQ_YEARS])) {
    res.status(HttpStatus.BAD_REQUEST).send("Minimum amout of years required to compare financial results must be an integer value")
    return
  }

  var stock_code = req.query[CONST_QRY_STR_CODE]
  var min_allowed_years_fin_result = Number(req.query[CONST_QRY_STR_MIN_REQ_YEARS])

  new dal().get(stock_code, function (data) {
    var arr_values_cash_flow_dividend = {}
    var arr_values_cash_flow_net_profit = {}
    var result_obj = {
      has_dividend_been_constantly_shared: null,
      has_dividend_grown_over_years: null,
      has_net_profit_grown_over_years: null,
    }

    arr_values_cash_flow_dividend = get_history_values(data, CONST_CASH_FLOW_HISTORY_DESC, CONST_PAYED_DIVIDENDS_FIELD)
    arr_values_cash_flow_net_profit = get_history_values(data, CONST_CASH_FLOW_HISTORY_DESC, CONST_NET_PROFIT_FIELD)

    result_obj.has_dividend_been_constantly_shared = have_financial_results_issued_year_after_year(arr_values_cash_flow_dividend, min_allowed_years_fin_result)
    result_obj.has_dividend_grown_over_years = are_values_indicating_growth(arr_values_cash_flow_dividend, min_allowed_years_fin_result)
    result_obj.has_net_profit_grown_over_years = are_values_indicating_growth(arr_values_cash_flow_net_profit, min_allowed_years_fin_result)

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