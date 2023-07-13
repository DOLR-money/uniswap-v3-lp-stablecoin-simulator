// packages
const { program } = require('commander');
const seedrandom = require('seedrandom');

// args
program
    .option('-s, --seed <int>', 'seed number')
    ;
program.parse();
const args = program.opts();

// Stablecoin Simulator
const dolr_name = "DOLR";
var price_oracle_eth = 2000;
var reserve_eth = 250;
// var price_oracle_eth = 1445.61;
// var reserve_eth = 23028215.99616748;
const dec_eth = 18;
const dec_dolr = 6;
const dec_dolr_display = 2;
const range_multiplier = 0.8;
const fee_lp_bps = 30;
const min_price_oracle_eth = 100;
const delta_price_oracle_eth_bps = 100;
const trade_max_eth = 25;
const trade_max_dolr = (trade_max_eth * price_oracle_eth);
const trade_max_arb_eth = trade_max_eth * 250;
const trade_max_arb_dolr = (trade_max_arb_eth * price_oracle_eth);
const trade_min_eth = .1;
const trade_min_dolr = 1000;
const trade_volume_per_day = 100000000;
const trade_avg_value = 25000;
const trade_number_per_day = (trade_volume_per_day / trade_avg_value); // 100000000 / 25000 = 4000
const trade_days = 30;
const initial_eth = reserve_eth;
const safety_min_eth = initial_eth * .5;
const initial_investment = (initial_eth * price_oracle_eth * 2);

var dolr_total_supply = 0;
var lp_eth = 0;
var lp_dolr = 0;
var price_lp = 0;
var lp_fees_eth = 0;
var lp_fees_dolr = 0;
var lifetime_profit_eth = 0;
var range_bound_lower;
var range_bound_upper;
var range_max_eth;
var range_max_dolr;
var price_lp_sqrt;
var range_bound_lower_sqrt;
var range_bound_upper_sqrt;
var liquidity_value;
var is_last_trade_eth = true;
var is_printing = true;
var seed;

var try_arb;
try {
    try_arb = require('./try-arb');
} catch (e) {
    try_arb = (_ctx) => {
        _ctx.log(`try_arb:`);
        // TODO
        return 0;
    }
}

function Sim() {
    var self = this;
}

Sim.prototype.log = function (_msg) {
    if (!is_printing) return;
    console.log(_msg);
}

Sim.prototype.exit = function (_msg) {
    this.log(`seed: ${seed}`);
    throw new Error(_msg);
}

Sim.prototype.get_name = function () {
    return dolr_name;
}

Sim.prototype.get_trade_max_arb_eth = function () {
    return trade_max_arb_eth;
}

Sim.prototype.get_trade_max_arb_dolr = function () {
    return trade_max_arb_dolr;
}

Sim.prototype.get_price_oracle_eth = function () {
    return price_oracle_eth;
}

Sim.prototype.get_price_lp = function () {
    return price_lp;
}

Sim.prototype.get_lp_eth = function () {
    return lp_eth;
}

Sim.prototype.set_lp_eth = function (_lp_eth) {
    lp_eth = _lp_eth;
}

Sim.prototype.get_lp_dolr = function () {
    return lp_dolr;
}

Sim.prototype.set_lp_dolr = function (_lp_dolr) {
    lp_dolr = _lp_dolr;
}

Sim.prototype.get_range_bound_lower = function () {
    return range_bound_lower;
}

Sim.prototype.get_range_bound_upper = function () {
    return range_bound_upper;
}

Sim.prototype.get_range_max_eth = function () {
    return range_max_eth;
}

Sim.prototype.get_range_max_dolr = function () {
    return range_max_dolr;
}

Sim.prototype.get_reserve_eth = function () {
    return reserve_eth;
}

Sim.prototype.set_reserve_eth = function (_reserve_eth) {
    reserve_eth = _reserve_eth;
}

Sim.prototype.get_initial_eth = function () {
    return initial_eth;
}

Sim.prototype.get_safety_min_eth = function () {
    return safety_min_eth;
}

Sim.prototype.decimals = function (_x, _decimals = dec_dolr) {
    const tens = 10 ** _decimals;
    return Number((Math.round(_x * tens) / tens).toFixed(_decimals));
}

Sim.prototype.decimals_eth = function (_x) {
    return this.decimals(_x, dec_eth);
}

Sim.prototype.dd = function (_x) {
    return this.decimals(_x, dec_dolr_display);
}

Sim.prototype.avg = function (_x, _y) {
    return (_x + _y) / 2;
}

Sim.prototype.get_random_int = function (_max) {
    return Math.floor(Math.random() * _max);
}

Sim.prototype.apply_fee_any = function (_fee_bps) {
    return _fee_bps / 10000;
}

Sim.prototype.apply_fee_lp = function (_x) {
    return _x * this.apply_fee_any(fee_lp_bps);
}

Sim.prototype.set_price_oracle_eth = function (_price_oracle_eth) {
    price_oracle_eth = _price_oracle_eth;
    this.log(`price_oracle_eth: ${this.dd(price_oracle_eth)}`);
}

Sim.prototype.set_price_lp = function (_is_balanced = false) {
    if (_is_balanced) {
        price_lp = (lp_dolr / lp_eth);
    } else {
        price_lp = is_last_trade_eth ? this.recalc_lp_price_from_lp_eth() : this.recalc_lp_price_from_lp_dolr();
    }
    price_lp_sqrt = Math.sqrt(price_lp);
    price_lp = this.decimals(price_lp);

    this.log(`price_lp: ${this.dd(price_lp)}`);
}

Sim.prototype.set_range_bounds = function () {
    range_bound_lower = price_lp * range_multiplier;
    range_bound_lower_sqrt = Math.sqrt(range_bound_lower);
    range_bound_lower = this.decimals(range_bound_lower);

    range_bound_upper = price_lp / range_multiplier;
    range_bound_upper_sqrt = Math.sqrt(range_bound_upper);
    range_bound_upper = this.decimals(range_bound_upper);

    this.log(`range_bound_lower: ${this.dd(range_bound_lower)}`);
    this.log(`range_bound_upper: ${this.dd(range_bound_upper)}`);

    if (!liquidity_value) return;
    range_max_eth = this.recalc_lp_eth(range_bound_lower);
    range_max_dolr = this.recalc_lp_dolr(range_bound_upper);

    this.log(`range_max_eth: ${range_max_eth}`);
    this.log(`range_max_dolr: ${this.dd(range_max_dolr)}`);
}

Sim.prototype.set_liquidity_value = function () {
    liquidity_value = (price_lp <= range_bound_lower ?
        (lp_eth * range_bound_lower_sqrt * range_bound_upper_sqrt) / (range_bound_upper_sqrt - range_bound_lower_sqrt) :
        (price_lp <= range_bound_upper ?
            Math.min(
                lp_eth * (range_bound_upper_sqrt * price_lp_sqrt) / (range_bound_upper_sqrt - price_lp_sqrt),
                lp_dolr / (price_lp_sqrt - range_bound_lower_sqrt)
            ) :
            lp_eth / (range_bound_upper_sqrt - range_bound_lower_sqrt)));
    if (liquidity_value <= 0) {
        this.exit(`set_liquidity_value: invalid value`);
    }
    liquidity_value = this.decimals(liquidity_value);

    this.log(`liquidity_value: ${this.dd(liquidity_value)}`);
}

// Sim.prototype.lp_helper_init = function() {
//     return (price_lp_sqrt - range_bound_lower_sqrt) / ((1 / price_lp_sqrt) - (1 / range_bound_upper_sqrt));
// }

// Sim.prototype.lp_eth_init = function() {
//     return (initial_investment / (price_lp + lp_helper_init() * 1));
// }

// Sim.prototype.lp_dolr_init = function() {
//     return (lp_eth_init() * lp_helper_init());
// }

Sim.prototype.mint = function (_amount) {
    if (_amount <= 0) {
        this.exit(`mint: invalid _amount`);
    }
    dolr_total_supply += _amount;
    dolr_total_supply = this.decimals(dolr_total_supply);
    this.log(`Minted ${dolr_name}: ${this.dd(_amount)}`);
    return _amount;
}

Sim.prototype.burn = function (_amount) {
    if (_amount <= 0) {
        this.exit(`burn: invalid _amount`);
    }
    if (_amount > dolr_total_supply) {
        this.exit(`burn: _amount > dolr_total_supply`);
    }
    dolr_total_supply -= _amount;
    dolr_total_supply = this.decimals(dolr_total_supply);
    this.log(`Burned ${dolr_name}: ${this.dd(_amount)}`);
    return _amount;
}

Sim.prototype.trade_eth_for_dolr = function (_amount) {
    if (_amount <= 0) {
        this.exit(`trade_eth_for_dolr: invalid _amount: ${_amount}`);
    }
    const fee = this.decimals_eth(this.apply_fee_lp(_amount));
    var amount_in = (_amount - fee);
    this.log(`trade_eth_for_dolr: amount_in: ${amount_in} ETH`);
    this.log(`trade_eth_for_dolr: fee: ${fee} ETH`);
    if (amount_in + lp_eth > range_max_eth) {
        this.exit(`trade_eth_for_dolr: _amount too large: ${_amount}`);
    }
    lp_fees_eth += fee;
    lp_eth += amount_in;
    const price_lp_pre = price_lp;
    const lp_dolr_pre = lp_dolr;
    is_last_trade_eth = true;
    this.set_price_lp();
    lp_dolr = this.recalc_lp_dolr();
    const amount_out = this.decimals(lp_dolr_pre - lp_dolr);
    const avg_price = this.decimals(amount_out / _amount);
    this.log(`Traded ${_amount} ETH for ${this.dd(amount_out)} ${dolr_name}. Avg price: ${this.dd(avg_price)}`);

    const skew = (price_lp / range_bound_lower) * 10;
    if (avg_price < (price_lp - this.apply_fee_lp(price_lp * skew))) {
        this.exit(`trade_eth_for_dolr: avg_price (${this.dd(avg_price)}) too LOW`);
    }
    if (avg_price > price_lp_pre / .9) {
        this.exit(`trade_eth_for_dolr: avg_price (${this.dd(avg_price)}) too HIGH`);
    }
    return amount_out;
}

Sim.prototype.trade_dolr_for_eth = function (_amount) {
    if (_amount <= 0) {
        this.exit(`trade_dolr_for_eth: invalid _amount: ${_amount}`);
    }
    const fee = this.decimals(this.apply_fee_lp(_amount));
    var amount_in = (_amount - fee);
    this.log(`trade_dolr_for_eth: amount_in: ${amount_in} ${dolr_name}`);
    this.log(`trade_dolr_for_eth: fee: ${fee} ${dolr_name}`);
    if (amount_in + lp_dolr > range_max_dolr) {
        this.exit(`trade_dolr_for_eth: _amount too large: ${_amount}`);
    }
    lp_fees_dolr += fee;
    lp_dolr += amount_in;
    const price_lp_pre = price_lp;
    const lp_eth_pre = lp_eth;
    is_last_trade_eth = false;
    this.set_price_lp();
    lp_eth = this.recalc_lp_eth();
    const amount_out = this.decimals_eth(lp_eth_pre - lp_eth);
    const avg_price = this.decimals(_amount / amount_out);
    this.log(`Traded ${this.dd(_amount)} ${dolr_name} for ${amount_out} ETH. Avg price: ${this.dd(avg_price)}`);

    const skew = (price_lp / range_bound_lower) * 10;
    if (avg_price > (price_lp + this.apply_fee_lp(price_lp * skew))) {
        this.exit(`trade_dolr_for_eth: avg_price (${this.dd(avg_price)}) too HIGH`);
    }
    if (avg_price < price_lp_pre * .9) {
        this.exit(`trade_dolr_for_eth: avg_price (${this.dd(avg_price)}) too LOW`);
    }
    return amount_out;
}

Sim.prototype.recalc_lp_eth = function (_price_lp_new = 0) {
    if (!_price_lp_new) _price_lp_new = price_lp;
    const price_lp_new_sqrt = Math.sqrt(_price_lp_new);
    var ans = (_price_lp_new < range_bound_lower ?
        (liquidity_value / range_bound_lower_sqrt) - (liquidity_value / range_bound_upper_sqrt) :
        (_price_lp_new < range_bound_upper ?
            (liquidity_value / price_lp_new_sqrt) - (liquidity_value / range_bound_upper_sqrt) :
            0)
    );
    ans = this.decimals_eth(ans);
    return ans;
}

Sim.prototype.recalc_lp_dolr = function (_price_lp_new = 0) {
    if (!_price_lp_new) _price_lp_new = price_lp;
    const price_lp_new_sqrt = Math.sqrt(_price_lp_new);
    var ans = (_price_lp_new <= range_bound_lower ?
        0 :
        (_price_lp_new < range_bound_upper ?
            (liquidity_value * price_lp_new_sqrt) - (liquidity_value * range_bound_lower_sqrt) :
            (liquidity_value * range_bound_upper_sqrt) - (liquidity_value * range_bound_lower_sqrt))
    );
    ans = this.decimals(ans);
    return ans;
}

/**
 * Pre: initialized: liquidity_value, lp_eth, this.set_range_bounds()
 */
Sim.prototype.recalc_lp_price_from_lp_eth = function (_lp_eth_new = Number.MIN_SAFE_INTEGER) {
    if (_lp_eth_new == Number.MIN_SAFE_INTEGER) _lp_eth_new = lp_eth;
    if (_lp_eth_new < 0 || _lp_eth_new > range_max_eth) {
        this.exit(`recalc_lp_price_from_lp_eth: invalid _lp_eth_new`);
    }
    var ans = ((liquidity_value * range_bound_upper_sqrt) / ((range_bound_upper_sqrt * _lp_eth_new) + liquidity_value)) ** 2;
    ans = this.decimals(ans);
    return ans;
}

/**
 * Pre: initialized: liquidity_value, lp_dolr, this.set_range_bounds()
 */
Sim.prototype.recalc_lp_price_from_lp_dolr = function (_lp_dolr_new = Number.MIN_SAFE_INTEGER) {
    if (_lp_dolr_new == Number.MIN_SAFE_INTEGER) _lp_dolr_new = lp_dolr;
    if (_lp_dolr_new < 0 || _lp_dolr_new > range_max_dolr) {
        this.exit(`recalc_lp_price_from_lp_dolr: invalid _lp_dolr_new`);
    }
    var ans = (((liquidity_value * range_bound_lower_sqrt) + _lp_dolr_new) / liquidity_value) ** 2;
    ans = this.decimals(ans);
    return ans;
}

Sim.prototype.get_dolr_float = function () {
    var ans = (dolr_total_supply - lp_dolr - lp_fees_dolr);
    ans = this.decimals(ans);
    if (ans < 0) {
        this.exit(`get_dolr_float: invalid ans: ${ans}`);
    }
    return ans;
}

Sim.prototype.get_lifetime_profit_mult = function () {
    return (lifetime_profit_eth + lp_fees_eth + (lp_fees_dolr / price_lp)) / initial_eth;
}

Sim.prototype.assert_safety = function () {
    if (lp_eth < safety_min_eth) {
        this.exit(`assert_safety: NOTICE: lp_eth too low`);
    }
    if (/* Math.abs */((price_oracle_eth / price_lp) - 1) > .10) {
        this.exit(`assert_safety: NOTICE: price divergence`);
    }
    // if (this.get_lifetime_profit_mult() > trade_days) {
    //     this.exit(`assert_safety: NOTICE: lifetime_profit_mult too high`);
    // }
}

Sim.prototype.get_fees_reserved_pct = function () {
    return (lp_eth < (safety_min_eth * 5)) ? 1.00 :
        (lp_eth < (safety_min_eth * 10)) ? 0.99 :
            (lp_eth < (safety_min_eth * 20)) ? 0.95 :
                (lp_eth < (safety_min_eth * 50)) ? 0.90 :
                    0.85;
}

Sim.prototype.try_redeem_lp_fees_dolr = function () {
    if (price_lp >= price_oracle_eth) return;

    const lp_fees_dolr_redeem = Math.min(
        this.decimals(lp_fees_dolr)
        , this.decimals(range_max_dolr - lp_dolr)
        , this.decimals(100 * Math.min(price_lp, price_oracle_eth))
    );
    if (lp_fees_dolr_redeem < 1 * price_oracle_eth) return;

    this.log(`lp_fees_dolr_redeem: trade_dolr_for_eth(${lp_fees_dolr_redeem});`);
    const lp_fees_dolr_redeem_eth = this.trade_dolr_for_eth(lp_fees_dolr_redeem);
    const lp_fees_dolr_redeem_eth_reserved = this.decimals_eth(lp_fees_dolr_redeem_eth * this.get_fees_reserved_pct());
    reserve_eth += lp_fees_dolr_redeem_eth_reserved;
    lifetime_profit_eth += this.decimals_eth(lp_fees_dolr_redeem_eth - lp_fees_dolr_redeem_eth_reserved);
    lp_fees_dolr -= lp_fees_dolr_redeem;

    lifetime_profit_eth = this.decimals_eth(lifetime_profit_eth);
}

Sim.prototype.try_redeem_lp_fees_eth = function () {
    if (lp_fees_eth < 1) return;

    const lp_fees_eth_redeem_eth_reserved = this.decimals_eth(lp_fees_eth * this.get_fees_reserved_pct());
    reserve_eth += lp_fees_eth_redeem_eth_reserved;
    lifetime_profit_eth += this.decimals_eth(lp_fees_eth - lp_fees_eth_redeem_eth_reserved);
    lp_fees_eth = 0;

    lifetime_profit_eth = this.decimals_eth(lifetime_profit_eth);
}

Sim.prototype.rebal = function (_is_arb = false) {
    this.log(`Rebal started.`);

    if (!_is_arb) {
        this.try_redeem_lp_fees_dolr();
    }
    this.try_redeem_lp_fees_eth();

    lp_eth += reserve_eth;
    reserve_eth = 0;

    var diffDolr = this.decimals((price_lp * lp_eth) - lp_dolr);
    if (diffDolr > 0) {
        this.mint(diffDolr);
        lp_dolr += diffDolr;
    } else if (diffDolr < 0) {
        diffDolr = Math.min(lp_dolr, Math.abs(diffDolr));
        this.burn(diffDolr);
        lp_dolr -= diffDolr;
    } else {
        // diffDolr == 0
    }

    is_printing = false;
    this.set_price_lp(true);
    this.set_range_bounds();
    this.set_liquidity_value();
    this.set_range_bounds();
    is_printing = true;

    lp_eth = this.decimals_eth(lp_eth);
    lp_dolr = this.decimals(lp_dolr);

    this.print_stats();
    this.log(`Rebal complete.`);
    this.log(``);
}

Sim.prototype.print_stats = function () {
    this.log(`price_lp: ${this.dd(price_lp)}`);
    this.log(`range_bound_lower: ${this.dd(range_bound_lower)}`);
    this.log(`range_bound_upper: ${this.dd(range_bound_upper)}`);
    this.log(`range_max_eth: ${range_max_eth}`);
    this.log(`range_max_dolr: ${this.dd(range_max_dolr)}`);
    this.log(`liquidity_value: ${this.dd(liquidity_value)}`);
    this.log(`lp_eth: ${lp_eth}`);
    this.log(`lp_dolr: ${this.dd(lp_dolr)}`);
    this.log(`lp_fees_eth: ${lp_fees_eth}`);
    this.log(`lp_fees_dolr: ${this.dd(lp_fees_dolr)}`);
    this.log(`dolr_total_supply: ${this.dd(dolr_total_supply)}`);
    this.log(`dolr_float: ${this.dd(this.get_dolr_float())}`);
    this.log(`lifetime_profit_eth: ${lifetime_profit_eth}`);
    this.log(`lifetime_profit_mult: ${this.dd(this.get_lifetime_profit_mult())} x`);
}

Sim.prototype.main = function (_price_oracle_eth = 0) {
    if (!_price_oracle_eth) _price_oracle_eth = price_oracle_eth;
    this.set_price_oracle_eth(_price_oracle_eth);

    seed = args.seed ? Number(args.seed) : this.get_random_int(Number.MAX_SAFE_INTEGER);
    seedrandom(seed, { global: true });

    // init
    price_lp = price_oracle_eth;
    price_lp_sqrt = Math.sqrt(price_lp);
    lp_eth = reserve_eth;
    reserve_eth = 0;
    lp_dolr = this.mint(this.decimals(price_lp * lp_eth));

    this.set_range_bounds();
    this.set_liquidity_value();
    this.rebal();

    // ERROR TESTS
    // this.mint(1);
    // this.set_price_oracle_eth(1435.69);
    // this.trade_dolr_for_eth(this.mint(30086255016));
    // this.log(``);
    // this.print_stats();
    // this.log(``);
    // this.set_price_oracle_eth(1454.89);
    // this.trade_dolr_for_eth(this.mint(970544385));
    // this.log(``);
    // this.print_stats();
    // this.log(``);
    // this.set_price_oracle_eth(1412.39);
    // this.trade_dolr_for_eth(this.mint(18377848));
    // return;

    this.log(this.recalc_lp_price_from_lp_eth(range_max_eth)); // 1600
    this.log(this.recalc_lp_price_from_lp_eth(0)); // 2500
    this.log(this.dd(this.recalc_lp_price_from_lp_eth(128.593))); // 2222
    this.log(this.dd(this.recalc_lp_price_from_lp_eth(68.879))); // 2345
    this.log(``);
    this.log(this.recalc_lp_price_from_lp_dolr(0)); // 1600
    this.log(this.recalc_lp_price_from_lp_dolr(range_max_dolr)); // 2500
    this.log(this.dd(this.recalc_lp_price_from_lp_dolr(755936.39))); // 2222
    this.log(this.dd(this.recalc_lp_price_from_lp_dolr(892243.00))); // 2345
    this.log(``);

    // const dolr_out = this.trade_eth_for_dolr(1);
    // this.log(`trade_eth_for_dolr(1): ${dolr_out}`);
    // const eth_out = this.trade_dolr_for_eth(2000);
    // this.log(`trade_dolr_for_eth(1): ${eth_out}`);
    // this.log(``);
    // return;

    // this.set_price_oracle_eth(2065);
    // try_arb(SimObj);
    // return;

    const trades_total = trade_number_per_day * trade_days;
    for (var i = 0; i < trades_total; i++) {
        this.log(`ACTION #${i}`);
        // const price_new = this.decimals(range_bound_lower + this.get_random_int(range_bound_upper - range_bound_lower));
        const delta_new = (price_oracle_eth * this.apply_fee_any(this.get_random_int(delta_price_oracle_eth_bps)))
            * (this.get_random_int(2) ? 1 : -1);
        const price_new = Math.max(min_price_oracle_eth, this.decimals(price_oracle_eth + delta_new));
        this.set_price_oracle_eth(price_new);

        // do a trade
        switch (this.get_random_int(2)) {
            case 0:
                const amount_eth = this.get_random_int(
                    Math.min(trade_max_eth, this.decimals_eth(range_max_eth - lp_eth))
                );
                if (amount_eth < trade_min_eth) break;
                this.log(`trade_eth_for_dolr(${amount_eth});`);
                this.trade_eth_for_dolr(amount_eth);
                break;
            case 1:
                const amount_dolr = this.get_random_int(
                    Math.min(trade_max_dolr, this.decimals(range_max_dolr - lp_dolr), this.get_dolr_float())
                );
                if (amount_dolr < trade_min_dolr) break;
                this.log(`trade_dolr_for_eth(${amount_dolr});`);
                this.trade_dolr_for_eth(amount_dolr);
                break;
            default:
                this.exit(`switch: FAIL`);
                break;
        }

        const arb_amount = try_arb(SimObj);
        if (!arb_amount) {
            if (i % 5 == 4) {
                this.rebal();
            } else {
                this.log(``);
            }
        }
        this.assert_safety();
    }

    this.log(`seed: ${seed}`);
    this.log(`PASS`);
}

var SimObj = new Sim();
SimObj.main();
