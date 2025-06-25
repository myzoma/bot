// إضافة مكتبة technicalindicators عبر CDN في HTML
// <script src="https://cdn.jsdelivr.net/npm/technicalindicators@3.1.0/dist/technicalindicators.min.js"></script>

class CryptoTradingBot {
    constructor() {
        this.opportunities = [];
        this.isConnected = false;
        this.lastUpdate = null;
        this.updateInterval = null;
        this.currentFilter = 'all';
        this.ws = null; // WebSocket connection
        this.historicalData = new Map(); // Store historical data for indicators
        
        this.init();
    }

    async connectToAPI() {
        try {
            this.showLoading(true);
            this.isConnected = false;

            // Get symbols
            const symbols = await this.getBinanceSymbols();
            const streams = symbols.map(symbol => `${symbol.toLowerCase()}@kline_1m`).join('/');
            this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus();
                console.log('Connected to Binance WebSocket');
                // Initialize historical data
                this.fetchInitialHistoricalData(symbols);
            };

            this.ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                if (data.e === 'kline') {
                    await this.handleWebSocketKline(data);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
                this.updateConnectionStatus();
            };

            this.ws.onclose = () => {
                console.log('WebSocket connection closed');
                this.isConnected = false;
                this.updateConnectionStatus();
                setTimeout(() => this.connectToAPI(), 5000);
            };

        } catch (error) {
            console.error('Connection error:', error);
            this.isConnected = false;
            this.updateConnectionStatus();
        } finally {
            this.showLoading(false);
        }
    }

    async fetchInitialHistoricalData(symbols) {
        for (const symbol of symbols) {
            try {
                const response = await fetch(
                    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=100`
                );
                const klines = await response.json();
                this.historicalData.set(symbol, klines.map(k => ({
                    timestamp: k[0],
                    open: parseFloat(k[1]),
                    high: parseFloat(k[2]),
                    low: parseFloat(k[3]),
                    close: parseFloat(k[4]),
                    volume: parseFloat(k[5])
                })));
            } catch (error) {
                console.error(`Error fetching historical data for ${symbol}:`, error);
            }
        }
    }

    async handleWebSocketKline(data) {
        try {
            const symbol = data.s;
            const kline = data.k;
            const candle = {
                timestamp: kline.t,
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: parseFloat(kline.c),
                volume: parseFloat(kline.v)
            };

            // Update historical data
            let symbolData = this.historicalData.get(symbol) || [];
            symbolData.push(candle);
            if (symbolData.length > 100) symbolData.shift(); // Keep last 100 candles
            this.historicalData.set(symbol, symbolData);

            // Fetch additional 24h data
            const tickerResponse = await fetch(
                `https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
            );
            const tickerData = await tickerResponse.json();

            // Calculate technical indicators
            const marketData = await this.calculateMarketData(symbol, candle, tickerData);
            const opportunities = await this.analyzeOpportunities([marketData]);
            this.opportunities = [...this.opportunities.filter(op => op.symbol !== symbol), ...opportunities];
            this.updateUI();
        } catch (error) {
            console.error('Error processing WebSocket data:', error);
        }
    }

    async fetchMarketData() {
        try {
            const symbols = await this.getBinanceSymbols();
            const marketData = [];
            for (const symbol of symbols) {
                const data = await this.getMarketData([symbol]);
                marketData.push(...data);
            }
            this.opportunities = await this.analyzeOpportunities(marketData);
            this.updateUI();
        } catch (error) {
            console.error('Error fetching market data:', error);
        }
    }

    async getBinanceSymbols() {
        return [
            'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT',
            'SOLUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'SHIBUSDT',
            'MATICUSDT', 'LTCUSDT', 'UNIUSDT', 'LINKUSDT', 'ATOMUSDT',
            'ETCUSDT', 'XLMUSDT', 'BCHUSDT', 'FILUSDT', 'TRXUSDT',
            'EOSUSDT', 'AAVEUSDT', 'GRTUSDT', 'MKRUSDT', 'COMPUSDT',
            'YFIUSDT', 'SUSHIUSDT', '1INCHUSDT', 'CRVUSDT', 'SNXUSDT'
        ];
    }

    async getMarketData(symbols) {
        const marketData = [];
        for (const symbol of symbols) {
            try {
                const tickerResponse = await fetch(
                    `https://api1.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
                );
                const tickerData = await tickerResponse.json();

                const klineResponse = await fetch(
                    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=1`
                );
                const klineData = await klineResponse.json();
                const latestCandle = klineData[0];

                const candle = {
                    timestamp: latestCandle[0],
                    open: parseFloat(latestCandle[1]),
                    high: parseFloat(latestCandle[2]),
                    low: parseFloat(latestCandle[3]),
                    close: parseFloat(latestCandle[4]),
                    volume: parseFloat(latestCandle[5])
                };

                const market = await this.calculateMarketData(symbol, candle, tickerData);
                marketData.push(market);
            } catch (error) {
                console.error(`Error fetching data for ${symbol}:`, error);
            }
        }
        return marketData;
    }

    async calculateMarketData(symbol, candle, tickerData) {
        const symbolData = this.historicalData.get(symbol) || [];
        const closes = symbolData.map(d => d.close);
        const highs = symbolData.map(d => d.high);
        const lows = symbolData.map(d => d.low);
        const volumes = symbolData.map(d => d.volume);

        // Calculate technical indicators using technicalindicators library
        const RSI = require('technicalindicators').RSI;
        const MACD = require('technicalindicators').MACD;
        const BollingerBands = require('technicalindicators').BollingerBands;

        const rsi = RSI.calculate({
            values: closes,
            period: 14
        }).slice(-1)[0] || 50;

        const macd = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9
        }).slice(-1)[0]?.MACD || 0;

        const bb = BollingerBands.calculate({
            period: 20,
            values: closes,
            stdDev: 2
        }).slice(-1)[0];
        const bb_position = bb ? (candle.close - bb.lower) / (bb.upper - bb.lower) : 0.5;

        // Calculate volume ratio (compare current volume to average)
        const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
        const volume_ratio = candle.volume / (avgVolume || 1);

        return {
            symbol: symbol,
            price: candle.close,
            change24h: parseFloat(tickerData.priceChangePercent),
            volume: parseFloat(tickerData.volume),
            high24h: parseFloat(tickerData.highPrice),
            low24h: parseFloat(tickerData.lowPrice),
            rsi: rsi,
            macd: macd,
            bb_position: bb_position,
            volume_ratio: volume_ratio,
            support: candle.close * (1 - 0.05), // Simplified, should use proper support calculation
            resistance: candle.close * (1 + 0.05) // Simplified
        };
    }
async analyzeOpportunities() {
        const opportunities = [];
        const analysisType = document.getElementById('analysisType').value;
        const riskLevel = document.getElementById('riskLevel').value;
        const minVolume = parseFloat(document.getElementById('minVolume').value);

        for (const [key, data] of this.marketData) {
            if (data.volume >= minVolume && data.rsi && data.macd !== undefined) {
                const analysis = this.performTechnicalAnalysis(data, analysisType, riskLevel);
                
                if (analysis.probability >= 60) {
                    opportunities.push({
                        ...data,
                        ...analysis,
                        timestamp: new Date()
                    });
                }
            }
        }
    
  

  
performTechnicalAnalysis(data, analysisType, riskLevel) {
        const signals = [];
        let signalType = 'hold';
        let probability = 50;
        let expectedReturn = 0;

        // تحليل RSI
        if (data.rsi < 30) {
            signals.push('RSI oversold');
            signalType = 'buy';
            probability += 15;
        } else if (data.rsi > 70) {
            signals.push('RSI overbought');
            signalType = 'sell';
            probability += 15;
        }

        // تحليل MACD
        if (data.macd > 0) {
            signals.push('MACD bullish');
            if (signalType === 'buy') probability += 10;
        } else {
            signals.push('MACD bearish');
            if (signalType === 'sell') probability += 10;
        }

        // تحليل Bollinger Bands
        if (data.bb_position < 0.2) {
            signals.push('BB lower band');
            if (signalType === 'buy') probability += 10;
        } else if (data.bb_position > 0.8) {
            signals.push('BB upper band');
            if (signalType === 'sell') probability += 10;
        }

        // تحليل الحجم
        if (data.volume_ratio > 2) {
            signals.push('High volume');
            probability += 10;
        }

        // حساب الأهداف والمخاطر
        const targets = this.calculateTargets(data, signalType, analysisType);
        const stopLoss = this.calculateStopLoss(data, signalType, riskLevel);
        expectedReturn = this.calculateExpectedReturn(data.price, targets, stopLoss, signalType);

        // تحديد قوة الإشارة
        const strength = this.calculateSignalStrength(signals, data);

        return {
            signalType,
            probability: Math.min(probability, 95),
            expectedReturn,
            targets,
            stopLoss,
            signals,
            strength,
            indicators: {
                rsi: data.rsi,
                macd: data.macd,
                bb_position: data.bb_position,
                volume_ratio: data.volume_ratio
            }
        };
    }
    calculateTargets(data, signalType, analysisType) {
        const multipliers = {
            scalping: [0.005, 0.01, 0.015],
            swing: [0.03, 0.06, 0.12],
            position: [0.1, 0.2, 0.35]
        };

        const mults = multipliers[analysisType];
        const direction = signalType === 'buy' ? 1 : -1;

        return mults.map((mult, index) => ({
            level: index + 1,
            price: data.price * (1 + (mult * direction)),
            percentage: mult * 100 * direction
        }));
    }

    calculateStopLoss(data, signalType, riskLevel) {
        const riskMultipliers = {
            low: 0.02,
            medium: 0.04,
            high: 0.08
        };

        const mult = riskMultipliers[riskLevel];
        const direction = signalType === 'buy' ? -1 : 1;

        return {
            price: data.price * (1 + (mult * direction)),
            percentage: mult * 100
        };
    }

    calculateExpectedReturn(currentPrice, targets, stopLoss, signalType) {
        const avgTargetPrice = targets.reduce((sum, target) => sum + target.price, 0) / targets.length;

        if (signalType === 'buy') {
            const potentialGain = ((avgTargetPrice - currentPrice) / currentPrice) * 100;
            const potentialLoss = ((currentPrice - stopLoss.price) / currentPrice) * 100;
            return (potentialGain * 0.7) - (potentialLoss * 0.3);
        } else {
            const potentialGain = ((currentPrice - avgTargetPrice) / currentPrice) * 100;
            const potentialLoss = ((stopLoss.price - currentPrice) / currentPrice) * 100;
            return (potentialGain * 0.7) - (potentialLoss * 0.3);
        }
    }

    calculateSignalStrength(signals, data) {
        let strength = 0;

        strength += signals.length * 10;

        if (data.volume_ratio > 2) strength += 15;
        if (data.volume_ratio > 3) strength += 10;

        if (data.rsi < 25 || data.rsi > 75) strength += 15;

        return Math.min(strength, 100);
    }

    updateRealTimeData() {
        if (this.opportunities.length > 0) {
            this.updateUI();
        }
    }

    updateUI() {
        this.updateStats();
        this.renderOpportunities();
        this.updateLastUpdateTime();
    }

    updateStats() {
        const totalOpportunities = this.opportunities.length;
        const highProbability = this.opportunities.filter(op => op.probability >= 80).length;
        const avgPotential = this.opportunities.reduce((sum, op) => sum + op.expectedReturn, 0) / totalOpportunities || 0;

        document.getElementById('totalOpportunities').textContent = totalOpportunities;
        document.getElementById('highProbability').textContent = highProbability;
        document.getElementById('avgPotential').textContent = avgPotential.toFixed(1) + '%';
    }

    renderOpportunities() {
        const grid = document.getElementById('opportunitiesGrid');
        const filteredOpportunities = this.filterOpportunities();

        grid.innerHTML = '';

        filteredOpportunities.forEach((opportunity, index) => {
            const card = this.createOpportunityCard(opportunity, index);
            grid.appendChild(card);
        });
    }

    filterOpportunities() {
        switch (this.currentFilter) {
            case 'buy':
                return this.opportunities.filter(op => op.signalType === 'buy');
            case 'sell':
                return this.opportunities.filter(op => op.signalType === 'sell');
            case 'high-prob':
                return this.opportunities.filter(op => op.probability >= 80);
            default:
                return this.opportunities;
        }
    }

    createOpportunityCard(opportunity, index) {
        const card = document.createElement('div');
        card.className = 'opportunity-card';
        card.style.animationDelay = `${index * 0.1}s`;

        const changeClass = opportunity.change24h >= 0 ? 'positive' : 'negative';
        const changeSymbol = opportunity.change24h >= 0 ? '+' : '';

        card.innerHTML = `
            <div class="card-header">
                <div class="symbol-info">
                    <h3>${this.formatSymbol(opportunity.symbol)}</h3>
                    <span class="exchange-badge">${opportunity.exchange}</span>
                </div>
                <div class="signal-badge ${opportunity.signalType}">
                    ${this.getSignalText(opportunity.signalType)}
                </div>
            </div>
            
            <div class="price-info">
                <div class="current-price">
                    <span class="label">السعر الحالي</span>
                    <span class="value">$${opportunity.price.toFixed(4)}</span>
                </div>
                <div class="price-change ${changeClass}">
                    <span class="label">التغيير 24س</span>
                    <span class="value">${changeSymbol}${opportunity.change24h.toFixed(2)}%</span>
                </div>
            </div>

            <div class="targets-section">
                <h4>🎯 الأهداف</h4>
                <div class="targets-list">
                    ${opportunity.targets.map(target => `
                        <div class="target-item">
                            <span>الهدف ${target.level}</span>
                            <span>$${target.price.toFixed(4)} (${target.percentage.toFixed(1)}%)</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="stop-loss-section">
                <h4>🛑 وقف الخسارة</h4>
                <div class="stop-loss-info">
                    <span class="label">السعر</span>
                    <span class="value">$${opportunity.stopLoss.price.toFixed(4)} (-${opportunity.stopLoss.percentage.toFixed(1)}%)</span>
                </div>
            </div>

            <div class="technical-indicators">
                <h4>📊 المؤشرات الفنية</h4>
                <div class="indicators-grid">
                    <div class="indicator">
                        <span class="label">RSI</span>
                        <span class="value ${this.getRSIClass(opportunity.indicators.rsi)}">${opportunity.indicators.rsi.toFixed(1)}</span>
                    </div>
                    <div class="indicator">
                        <span class="label">MACD</span>
                        <span class="value ${opportunity.indicators.macd > 0 ? 'bullish' : 'bearish'}">${opportunity.indicators.macd.toFixed(3)}</span>
                    </div>
                    <div class="indicator">
                        <span class="label">الحجم</span>
                        <span class="value ${opportunity.indicators.volume_ratio > 1.5 ? 'bullish' : 'neutral'}">${opportunity.indicators.volume_ratio.toFixed(1)}x</span>
                    </div>
                    <div class="indicator">
                        <span class="label">القوة</span>
                        <span class="value ${this.getStrengthClass(opportunity.strength)}">${opportunity.strength}%</span>
                    </div>
                </div>
            </div>

            <div class="analysis-summary">
                <div class="probability">
                    <span class="label">احتمالية النجاح</span>
                    <span class="value">${opportunity.probability.toFixed(0)}%</span>
                </div>
                <div class="expected-return">
                    <span class="label">الربح المتوقع</span>
                    <span class="value">+${opportunity.expectedReturn.toFixed(1)}%</span>
                </div>
                <div class="risk-ratio">
                    <span class="label">نسبة المخاطرة</span>
                    <span class="value">${opportunity.stopLoss.percentage.toFixed(1)}%</span>
                </div>
                <div class="rr-ratio">
                    <span class="label">R/R النسبة</span>
                    <span class="value">${(Math.abs(opportunity.expectedReturn) / opportunity.stopLoss.percentage).toFixed(1)}:1</span>
                </div>
            </div>
        `;

        return card;
    }

    formatSymbol(symbol) {
        if (symbol.includes('-')) {
            return symbol.replace('-', '/');
        } else {
            return symbol.replace('USDT', '/USDT');
        }
    }

    getSignalText(signalType) {
        const signals = {
            'buy': 'شراء',
            'sell': 'بيع',
            'hold': 'انتظار'
        };
        return signals[signalType] || signalType;
    }

    getRSIClass(rsi) {
        if (rsi < 30) return 'bullish';
        if (rsi > 70) return 'bearish';
        return 'neutral';
    }

    getStrengthClass(strength) {
        if (strength >= 70) return 'bullish';
        if (strength >= 40) return 'neutral';
        return 'bearish';
    }

    setActiveFilter(filter) {
        this.currentFilter = filter;

        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');

        this.renderOpportunities();
    }

    updateConnectionStatus() {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('statusText');

        if (this.isConnected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'متصل - البيانات مباشرة';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'غير متصل';
        }
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('lastUpdate').textContent = timeString;
        this.lastUpdate = now;
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (show) {
            overlay.classList.add('active');
        } else {
            overlay.classList.remove('active');
        }
    }

    async refreshData() {
        if (!this.isConnected) {
            await this.connectToAPI();
            return;
        }

        this.showLoading(true);
        try {
            await this.fetchMarketData();
        } catch (error) {
            console.error('خطأ في تحديث البيانات:', error);
        } finally {
            this.showLoading(false);
        }
    }

    startAutoUpdate() {
        // تحديث البيانات كل 30 ثانية
        this.updateInterval = setInterval(() => {
            if (this.isConnected) {
                this.refreshData();
            }
        }, 90000);
    }

    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // دوال التحليل الفني المتقدم
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;

        let gains = 0;
        let losses = 0;

        // حساب المتوسط الأولي
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                gains += change;
            } else {
                losses -= change;
            }
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // حساب RSI للفترات المتبقية
        for (let i = period + 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) - change) / period;
            }
        }

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    calculateSMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    }

    calculateEMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        
        const multiplier = 2 / (period + 1);
        let ema = this.calculateSMA(prices.slice(0, period), period);

        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
        }

        return ema;
    }

    calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (prices.length < slowPeriod) return 0;

        const fastEMA = this.calculateEMA(prices, fastPeriod);
        const slowEMA = this.calculateEMA(prices, slowPeriod);
        const macdLine = fastEMA - slowEMA;

        return macdLine;
    }

    calculateBollingerBands(prices, period = 20, stdDev = 2) {
        if (prices.length < period) {
            const price = prices[prices.length - 1];
            return {
                upper: price * 1.02,
                middle: price,
                lower: price * 0.98
            };
        }

        const sma = this.calculateSMA(prices, period);
        const recentPrices = prices.slice(-period);
        
        const variance = recentPrices.reduce((sum, price) => {
            return sum + Math.pow(price - sma, 2);
        }, 0) / period;
        
        const standardDeviation = Math.sqrt(variance);

        return {
            upper: sma + (standardDeviation * stdDev),
            middle: sma,
            lower: sma - (standardDeviation * stdDev)
        };
    }

    calculateBollingerPosition(prices) {
        const bb = this.calculateBollingerBands(prices);
        const currentPrice = prices[prices.length - 1];
        
        if (bb.upper === bb.lower) return 0.5;
        
        return (currentPrice - bb.lower) / (bb.upper - bb.lower);
    }

    calculateVolumeRatio(volumes) {
        if (volumes.length < 20) return 1;
        
        const recentVolume = volumes[volumes.length - 1];
        const avgVolume = this.calculateSMA(volumes.slice(-20), 20);
        
        return recentVolume / avgVolume;
    }

    // تحليل الشموع اليابانية
    analyzeCandlestickPatterns(ohlcData) {
        if (ohlcData.length < 2) return [];

        const patterns = [];
        const current = ohlcData[ohlcData.length - 1];
        const previous = ohlcData[ohlcData.length - 2];

        // نموذج المطرقة
        if (this.isHammer(current)) {
            patterns.push({
                name: 'Hammer',
                signal: 'bullish',
                strength: 70
            });
        }

        // نموذج الدوجي
        if (this.isDoji(current)) {
            patterns.push({
                name: 'Doji',
                signal: 'neutral',
                strength: 50
            });
        }

        // نموذج الابتلاع الصاعد
        if (this.isBullishEngulfing(previous, current)) {
            patterns.push({
                name: 'Bullish Engulfing',
                signal: 'bullish',
                strength: 80
            });
        }

        // نموذج الابتلاع الهابط
        if (this.isBearishEngulfing(previous, current)) {
            patterns.push({
                name: 'Bearish Engulfing',
                signal: 'bearish',
                strength: 80
            });
        }

        return patterns;
    }

    isHammer(candle) {
        const bodySize = Math.abs(candle.close - candle.open);
        const lowerShadow = candle.open < candle.close ? 
            candle.open - candle.low : candle.close - candle.low;
        const upperShadow = candle.high - Math.max(candle.open, candle.close);

        return lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5;
    }

    isDoji(candle) {
        const bodySize = Math.abs(candle.close - candle.open);
        const totalRange = candle.high - candle.low;
        
        return bodySize < totalRange * 0.1;
    }

    isBullishEngulfing(previous, current) {
        return previous.close < previous.open && // الشمعة السابقة هابطة
               current.close > current.open && // الشمعة الحالية صاعدة
               current.open < previous.close && // فتح أقل من إغلاق السابقة
               current.close > previous.open; // إغلاق أعلى من فتح السابقة
    }

    isBearishEngulfing(previous, current) {
        return previous.close > previous.open && // الشمعة السابقة صاعدة
               current.close < current.open && // الشمعة الحالية هابطة
               current.open > previous.close && // فتح أعلى من إغلاق السابقة
               current.close < previous.open; // إغلاق أقل من فتح السابقة
    }

    // تحليل مستويات الدعم والمقاومة
    calculateSupportResistance(prices, periods = [20, 50, 100]) {
        const levels = [];

        periods.forEach(period => {
            if (prices.length >= period) {
                const recentPrices = prices.slice(-period);
                const high = Math.max(...recentPrices);
                const low = Math.min(...recentPrices);

                levels.push({
                    resistance: high,
                    support: low,
                    period: period,
                    strength: this.calculateLevelStrength(prices, high, low)
                });
            }
        });

        return levels;
    }

    calculateLevelStrength(prices, level, tolerance = 0.01) {
        let touches = 0;
        prices.forEach(price => {
            if (Math.abs(price - level) / level <= tolerance) {
                touches++;
            }
        });
        return Math.min(touches * 20, 100);
    }

    // تحليل الحجم المتقدم
    calculateVolumeProfile(prices, volumes) {
        const priceRanges = {};
        const priceStep = (Math.max(...prices) - Math.min(...prices)) / 20;

        prices.forEach((price, index) => {
            const rangeKey = Math.floor(price / priceStep) * priceStep;
            if (!priceRanges[rangeKey]) {
                priceRanges[rangeKey] = 0;
            }
            priceRanges[rangeKey] += volumes[index] || 0;
        });

        const sortedLevels = Object.entries(priceRanges)
            .map(([price, volume]) => ({ price: parseFloat(price), volume }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 5);

        return {
            poc: sortedLevels[0], // Point of Control
            highVolumeNodes: sortedLevels,
            totalVolume: volumes.reduce((sum, vol) => sum + vol, 0)
        };
    }

    // نظام تقييم المخاطر المتقدم
    calculateAdvancedRisk(opportunity) {
        let riskScore = 0;
        const factors = [];

        // مخاطر التقلبات
        const volatility = Math.abs(opportunity.change24h);
        if (volatility > 10) {
            riskScore += 30;
            factors.push('High volatility');
        } else if (volatility > 5) {
            riskScore += 15;
            factors.push('Medium volatility');
        }

        // مخاطر الحجم
        if (opportunity.volume_ratio < 0.5) {
            riskScore += 20;
            factors.push('Low volume');
        }

        // مخاطر RSI
        if (opportunity.indicators.rsi > 80 || opportunity.indicators.rsi < 20) {
            riskScore += 15;
            factors.push('Extreme RSI');
        }

        // مخاطر السوق العام
        const marketTrend = this.calculateMarketTrend();
        if (marketTrend === 'bearish') {
            riskScore += 25;
            factors.push('Bearish market');
        }

        return {
            score: Math.min(riskScore, 100),
            level: riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high',
            factors: factors
        };
    }

    calculateMarketTrend() {
        const btcData = this.marketData.get('binance_BTCUSDT') || this.marketData.get('okx_BTC-USDT');
        if (!btcData) return 'neutral';

        if (btcData.change24h > 2) return 'bullish';
        if (btcData.change24h < -2) return 'bearish';
        return 'neutral';
    }

    // تنظيف الموارد عند إغلاق التطبيق
    cleanup() {
        this.stopAutoUpdate();
        
        if (this.binanceWs) {
            this.binanceWs.close();
        }
        
        if (this.okxWs) {
            this.okxWs.close();
        }
    }

    // معالجة الأخطاء المتقدمة
    handleError(error, context) {
        console.error(`خطأ في ${context}:`, error);
        
        // إعادة الاتصال في حالة انقطاع الشبكة
        if (error.name === 'NetworkError' || error.message.includes('fetch')) {
            setTimeout(() => {
                this.connectToAPI();
            }, 5000);
        }
        
        // تسجيل الأخطاء للمراجعة
        this.logError(error, context);
    }

    logError(error, context) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            context: context,
            message: error.message,
            stack: error.stack
        };
        
        // يمكن إرسال هذا إلى خدمة تسجيل الأخطاء
        console.log('Error logged:', errorLog);
    }
}
// تشغيل البوت
document.addEventListener('DOMContentLoaded', () => {
    const bot = new EnhancedCryptoTradingBot();
    bot.start();
    window.cryptoBot = bot;
});
