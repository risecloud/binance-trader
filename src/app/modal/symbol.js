'use strict';

var _ = require('lodash');
var config = require('config');

var Symbol = function(symbol) {
	this.symbol = symbol;
	this.lastTime = 0;
	this.kline = null;
	this.ticker = null;
	this.tradeNow = null;
	this.tradeLowest = null;
	this.tradeHighest = null;
	this.book = null;
	this.bookBuffer = [];
	this.config = null;

	this.initDCA = function() {
		this.config.bag.dca = _.cloneDeep(this.config.strategy.dca);
	}

	this.loadConfig = function(config, quantity, cost) {
		this.config = config;
		if(this.config.bag.quantity == null) this.config.bag.quantity = quantity;
		if(this.config.bag.cost == null) this.config.bag.cost = cost;
		this.config.bag.quantity = Math.min(this.config.bag.quantity, quantity);
		if(this.config.bag.cost > 0) this.initDCA();
	}

	this.setBook = function(book) {
		this.book = {
			'lastUpdateId': book.lastUpdateId,
			'bids': {},
			'asks': {}
		};
		_.each(book.bids, (bid) => {
			this.book.bids[bid[0]] = { price: Number(bid[0]), quantity: Number(bid[1]) };
		});
		_.each(book.asks, (ask) => {
			this.book.asks[ask[0]] = { price: Number(ask[0]), quantity: Number(ask[1]) };
		});

		console.log('bookBuffer.length', this.bookBuffer.length);
		_.each(this.bookBuffer, (b) => {
			this.updateBook(b);
		});
	}

	this.updateBook = function(book) {

		if(this.book == null) { // buffer the stream so that depth snapshot can be updated properly
			this.bookBuffer.push(book);
			return;
		}
		// drop update if old
		if(book.lastUpdateId <= this.book.lastUpdateId) return;
		this.book.lastUpdateId = book.lastUpdateId
		_.each(book.bidDepthDelta, (bid) => {
			var quantity = Number(bid.quantity);
			var price = bid.price; // typeof string
			if(quantity > 0) {
				this.book.bids[price] = { 'price': Number(price), 'quantity': quantity };
			} else {
				delete this.book.bids[price];
			}
		});
		_.each(book.askDepthDelta, (ask) => {
			var quantity = Number(ask.quantity);
			var price = ask.price; // typeof string
			if(quantity > 0) {
				this.book.asks[price] = { 'price': Number(price), 'quantity': quantity };
			} else {
				delete this.book.asks[price];
			}
		});
	}

	this.getBook = function() {
		var book = {
			'lastUpdateId': this.book.lastUpdateId,
			'bids': _.orderBy(this.book.bids, ['price'], ['desc']),
			'asks': _.orderBy(this.book.asks, ['price'], ['asc'])
		};
		return book;
	}

	this.updateTrade = function(trade) {

		this.trade = trade;

		// if we are trailing price, we want to record the lowest and highest price
		if(this.config.bag.POSITION & Symbol.TRAILING > 0) {
			if(this.tradeLowest == null || (Number(trade.price) < Number(this.tradeLowest.price))) this.tradeLowest = trade;
			if(this.tradeHighest == null || (Number(trade.price) > Number(this.tradeHighest.price))) this.tradeHighest = trade;
		} else {
			this.tradeLowest = this.tradeHighest = trade;
		}		
	}

	this.ready = function() {
		return (this.trade != null
			&& Array.isArray(this.kline) && this.kline.length > 0
			&& this.ticker != null
			&& this.book != null
			&& this.config.bag.quantity != null
			&& this.config.bag.cost != null);
	}

	this.wantToSell = function() {
		if(this.config.bag.quantity > 0 && this.config.bag.cost > 0) {
			return true;
		} else {
			return false;
		}
	}

	this.canBuy = function(quantity, price) {
		if(quantity * price < this.config.strategy.buy.minCost) {
			return false;
		} else return true;
	}
}

Symbol.POSITION = {
	'ANALYZING': 0,
	'TRAILING': 0b000010010,
    // when bag is empty, switch to buy mode
    'ANYBUY': 0b000000111, 'BUY': 0b000000001, 'BUYING': 0b000000010, 'BIDDING': 0b000000100,
    // when bag is not empty, switch to sell mode
    'ANYSELL': 0b000111000, 'SELL': 0b000001000, 'SELLING': 0b000010000, 'ASKING': 0b000100000,
    // when current price fall belows average bag cost, switch to DCA mode
    'ANYDCA': 0b111000000, 'DCA': 0b001000000, 'DCABUYING': 0b010000000, 'DCABIDDING': 0b100000000
}

module.exports = Symbol;