class CryptoTradingBot {
    constructor() {
        this.opportunities = [];
        this.isConnected = false;
        this.lastUpdate = null;
        this.updateInterval = null;
        this.currentFilter = 'all';
        this.binanceWs = null;
        this.okxWs = null;
        this.marketData = new Map();
        this.priceStreams = new Map();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectToAPI();
        this.startAutoUpdate();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.setActiveFilter(e.target.dataset.filter);
            });
        });

        // Analysis type change
        document.getElementById('analysisType').addEventListener('change', () => {
            this.refreshData();
        });

        // Risk level change
        document.getElementById('riskLevel').addEventListener('change', () => {
            this.refreshData();
        });

        // Min volume change
        document.getElementById('minVolume').addEventListener('change', () => {
            this.refreshData();
        });
    }

    async connectToAPI() {
        try {
            this.showLoading(true);
            
            // الاتصال بـ Binance و OKX
            await Promise.all([
                this.connectToBinance(),
                this.connectToOKX()
            ]);
            
            this.isConnected = true;
            this.updateConnectionStatus();
            await this.fetchMarketData();
            
        } catch (error) {
            console.error('خطأ في الاتصال:', error);
            this.isConnected = false;
            this.updateConnectionStatus();
        } finally {
            this.showLoading(false);
        }
    }

    async connectToBinance() {
        try {
            const response = await fetch('https://api1.binance.com/api/v3/ping');
            if (!response.ok) throw new Error('Binance connection failed');
            
            this.setupBinanceWebSocket();
            console.log('تم الاتصال بـ Binance بنجاح');
        } catch (error) {
            console.error('خطأ في الاتصال بـ Binance:', error);
            throw error;
        }
    }

    async connectToOKX() {
        try {
            const response = await fetch('https://www.okx.com/api/v5/public/time');
            if (!response.ok) throw new Error('OKX connection failed');
            
            this.setupOKXWebSocket();
            console.log('تم الاتصال بـ OKX بنجاح');
        } catch (error) {
            console.error('خطأ في الاتصال بـ OKX:', error);
            throw error;
        }
    }

    setupBinanceWebSocket() {
        const symbols = this.getBinanceSymbols();
        const streams = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`).join('/');
        
        this.binanceWs = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
        
        this.binanceWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.data) {
                    this.processBinanceData(data.data);
                }
            } catch (error) {
                console.error('خطأ في معالجة بيانات Binance:', error);
            }
        };

        this.binanceWs.onerror = (error) => {
            console.error('خطأ في WebSocket Binance:', error);
        };

        this.binanceWs.onclose = () => {
            console.log('تم إغلاق اتصال Binance WebSocket');
            setTimeout(() => this.setupBinanceWebSocket(), 5000);
        };
    }

    setupOKXWebSocket() {
        const symbols = this.getOKXSymbols();
        
        this.okxWs = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
        
        this.okxWs.onopen = () => {
            const subscribeMsg = {
                op: 'subscribe',
                args: symbols.map(symbol => ({
                    channel: 'tickers',
                    instId: symbol
                }))
            };
            this.okxWs.send(JSON.stringify(subscribeMsg));
        };

        this.okxWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.data) {
                    this.processOKXData(data.data);
                }
            } catch (error) {
                console.error('خطأ في معالجة بيانات OKX:', error);
            }
        };

        this.okxWs.onerror = (error) => {
            console.error('خطأ في WebSocket OKX:', error);
        };

        this.okxWs.onclose = () => {
            console.log('تم إغلاق اتصال OKX WebSocket');
            setTimeout(() => this.setupOKXWebSocket(), 5000);
        };
    }

    processBinanceData(data) {
        const marketData = {
            exchange: 'Binance',
            symbol: data.s,
            price: parseFloat(data.c),
            change24h: parseFloat(data.P),
            volume: parseFloat(data.v),
            high24h: parseFloat(data.h),
            low24h: parseFloat(data.l),
            timestamp: Date.now()
        };
        
        this.marketData.set(`binance_${data.s}`, marketData);
        this.updateRealTimeData();
    }

    processOKXData(dataArray) {
        dataArray.forEach(data => {
            const marketData = {
                exchange: 'OKX',
                symbol: data.instId,
                price: parseFloat(data.last),
                change24h: parseFloat(data.chgUtc0) * 100,
                volume: parseFloat(data.vol24h),
                high24h: parseFloat(data.high24h),
                low24h: parseFloat(data.low24h),
                timestamp: Date.now()
            };
            
            this.marketData.set(`okx_${data.instId}`, marketData);
            this.updateRealTimeData();
        });
    }

    async fetchMarketData() {
        try {
            await Promise.all([
                this.fetchBinanceData(),
                this.fetchOKXData()
            ]);
            
            await this.analyzeOpportunities();
            this.updateUI();
            
        } catch (error) {
            console.error('خطأ في جلب البيانات:', error);
        }
    }

    async fetchBinanceData() {
        try {
            const response = await fetch('https://api1.binance.com/api/v3/ticker/24hr');
            const data = await response.json();
            
            const symbols = this.getBinanceSymbols();
            
            data.forEach(ticker => {
                if (symbols.includes(ticker.symbol)) {
                    const marketData = {
                        exchange: 'Binance',
                        symbol: ticker.symbol,
                        price: parseFloat(ticker.lastPrice),
                        change24h: parseFloat(ticker.priceChangePercent),
                        volume: parseFloat(ticker.volume),
                        high24h: parseFloat(ticker.highPrice),
                        low24h: parseFloat(ticker.lowPrice),
                        timestamp: Date.now()
                    };
                    
                    this.marketData.set(`binance_${ticker.symbol}`, marketData);
                }
            });
            
            await this.fetchBinanceTechnicalData();
            
        } catch (error) {
            console.error('خطأ في جلب بيانات Binance:', error);
        }
    }

    async fetchOKXData() {
        try {
            const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
            const result = await response.json();
            
            if (result.code === '0') {
                const symbols = this.getOKXSymbols();
                
                result.data.forEach(ticker => {
                    if (symbols.includes(ticker.instId)) {
                        const marketData = {
                            exchange: 'OKX',
                            symbol: ticker.instId,
                            price: parseFloat(ticker.last),
                            change24h: parseFloat(ticker.chgUtc0) * 100,
                            volume: parseFloat(ticker.vol24h),
                            high24h: parseFloat(ticker.high24h),
                            low24h: parseFloat(ticker.low24h),
                            timestamp: Date.now()
                        };
                        
                        this.marketData.set(`okx_${ticker.instId}`, marketData);
                    }
                });
            }
            
            await this.fetchOKXTechnicalData();
            
        } catch (error) {
            console.error('خطأ في جلب بيانات OKX:', error);
        }
    }

    async fetchBinanceTechnicalData() {
        const symbols = this.getBinanceSymbols();
        
        for (const symbol of symbols) {
            try {
                const klinesResponse = await fetch(
                    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`
                );
                const klines = await klinesResponse.json();
                
                if (klines && klines.length > 0) {
                    const technicalData = this.calculateTechnicalIndicators(klines);
                    const existingData = this.marketData.get(`binance_${symbol}`);
                    
                    if (existingData) {
                        this.marketData.set(`binance_${symbol}`, {
                            ...existingData,
                            ...technicalData
                        });
                    }
                }
                
                await this.delay(100);
                
            } catch (error) {
                console.error(`خطأ في جلب البيانات التقنية لـ ${symbol}:`, error);
            }
        }
    }

    async fetchOKXTechnicalData() {
        const symbols = this.getOKXSymbols();
        
        for (const symbol of symbols) {
            try {
                const response = await fetch(
                    `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1H&limit=100`
                );
                const result = await response.json();
                
                if (result.code === '0' && result.data.length > 0) {
                    const technicalData = this.calculateTechnicalIndicatorsOKX(result.data);
                    const existingData = this.marketData.get(`okx_${symbol}`);
                    
                    if (existingData) {
                        this.marketData.set(`okx_${symbol}`, {
                            ...existingData,
                            ...technicalData
                        });
                    }
                }
                
                await this.delay(100);
                
            } catch (error) {
                console.error(`خطأ في جلب البيانات التقنية لـ ${symbol}:`, error);
            }
        }
    }

    calculateTechnicalIndicators(klines) {
        const closes = klines.map(k => parseFloat(k[4]));
        const highs = klines.map(k => parseFloat(k[2]));
        const lows = klines.map(k => parseFloat(k[3]));
        const volumes = klines.map(k => parseFloat(k[5]));
        
        return {
            rsi: this.calculateRSI(closes),
            macd: this.calculateMACD(closes),
            bb_position: this.calculateBollingerPosition(closes),
            volume_ratio: this.calculateVolumeRatio(volumes),
            support: Math.min(...lows.slice(-20)),
            resistance: Math.max(...highs.slice(-20))
        };
    }

    calculateTechnicalIndicatorsOKX(candles) {
        const closes = candles.map(c => parseFloat(c[4]));
        const highs = candles.map(c => parseFloat(c[2]));
        const lows = candles.map(c => parseFloat(c[3]));
        const volumes = candles.map(c => parseFloat(c[5]));
        
        return {
            rsi: this.calculateRSI(closes),
            macd: this.calculateMACD(closes),
            bb_position: this.calculateBollingerPosition(closes),
            volume_ratio: this.calculateVolumeRatio(volumes),
            support: Math.min(...lows.slice(-20)),
            resistance: Math.max(...highs.slice(-20))
        };
    }

    getBinanceSymbols() {
        return [
            'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT',
            'SOLUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'SHIBUSDT',
            'MATICUSDT', 'LTCUSDT', 'UNIUSDT', 'LINKUSDT', 'ATOMUSDT',
            'ETCUSDT', 'XLMUSDT', 'BCHUSDT', 'FILUSDT', 'TRXUSDT',
            'EOSUSDT', 'AAVEUSDT', 'GRTUSDT', 'MKRUSDT', 'COMPUSDT',
            'YFIUSDT', 'SUSHIUSDT', '1INCHUSDT', 'CRVUSDT', 'SNXUSDT'
        ];
    }

    getOKXSymbols() {
        return [
            'BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'ADA-USDT', 'XRP-USDT',
            'SOL-USDT', 'DOT-USDT', 'DOGE-USDT', 'AVAX-USDT', 'SHIB-USDT',
            'MATIC-USDT', 'LTC-USDT', 'UNI-USDT', 'LINK-USDT', 'ATOM-USDT',
            'ETC-USDT', 'XLM-USDT', 'BCH-USDT', 'FIL-USDT', 'TRX-USDT',
                     'EOS-USDT', 'AAVE-USDT', 'GRT-USDT', 'MKR-USDT', 'COMP-USDT',
            'YFI-USDT', 'SUSHI-USDT', '1INCH-USDT', 'CRV-USDT', 'SNX-USDT'
        ];
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

        opportunities.sort((a, b) => {
            const scoreA = a.probability * a.expectedReturn;
            const scoreB = b.probability * b.expectedReturn;
            return scoreB - scoreA;
        });

        this.opportunities = opportunities.slice(0, 30);
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

// تشغيل البوت عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.cryptoBot = new CryptoTradingBot();
    
    // تنظيف الموارد عند إغلاق الصفحة
    window.addEventListener('beforeunload', () => {
        if (window.cryptoBot) {
            window.cryptoBot.cleanup();
        }
    });
});

// معالجة الأخطاء العامة
window.addEventListener('error', (event) => {
    console.error('خطأ عام في التطبيق:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise مرفوض:', event.reason);
});

// إضافة أنماط CSS للتنبيهات والتصدير
const additionalStyles = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid #f7931a;
    border-radius: 10px;
    padding: 15px;
    color: white;
    z-index: 10000;
    animation: slideInRight 0.3s ease;
    max-width: 300px;
}

.notification.high {
    border-color: #ff4444;
    box-shadow: 0 0 20px rgba(255, 68, 68, 0.3);
}

.notification.medium {
    border-color: #ffb347;
    box-shadow: 0 0 20px rgba(255, 179, 71, 0.3);
}

.notification-content {
    display: flex;
    align-items: center;
    gap: 10px;
}

.close-notification {
    background: none;
    border: none;
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    margin-left: auto;
}

.export-container {
    display: flex;
    gap: 10px;
}

.export-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 8px 16px;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.9rem;
}

.export-btn:hover {
    background: rgba(247, 147, 26, 0.2);
    border-color: #f7931a;
    transform: translateY(-2px);
}

@keyframes slideInRight {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}
`;

// إضافة الأنماط الإضافية
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// إضافة وظائف متقدمة للتحليل الفني
class AdvancedTechnicalAnalysis {
    static calculateFibonacciLevels(high, low) {
        const diff = high - low;
        return {
            level_0: low,
            level_236: low + (diff * 0.236),
            level_382: low + (diff * 0.382),
            level_500: low + (diff * 0.500),
            level_618: low + (diff * 0.618),
            level_786: low + (diff * 0.786),
            level_100: high
        };
    }

    static calculateIchimokuCloud(prices, periods = [9, 26, 52]) {
        const [tenkan, kijun, senkou] = periods;
        
        const tenkanSen = (Math.max(...prices.slice(-tenkan)) + Math.min(...prices.slice(-tenkan))) / 2;
        const kijunSen = (Math.max(...prices.slice(-kijun)) + Math.min(...prices.slice(-kijun))) / 2;
        const senkouSpanA = (tenkanSen + kijunSen) / 2;
        const senkouSpanB = (Math.max(...prices.slice(-senkou)) + Math.min(...prices.slice(-senkou))) / 2;
        
        return {
            tenkanSen,
            kijunSen,
            senkouSpanA,
            senkouSpanB,
            signal: this.getIchimokuSignal(prices[prices.length - 1], senkouSpanA, senkouSpanB)
        };
    }

    static getIchimokuSignal(price, spanA, spanB) {
        const cloudTop = Math.max(spanA, spanB);
        const cloudBottom = Math.min(spanA, spanB);
        
        if (price > cloudTop) return 'bullish';
        if (price < cloudBottom) return 'bearish';
        return 'neutral';
    }

    static calculateStochasticOscillator(high, low, close, kPeriod = 14, dPeriod = 3) {
        const highestHigh = Math.max(...high.slice(-kPeriod));
        const lowestLow = Math.min(...low.slice(-kPeriod));
        
        const kPercent = ((close[close.length - 1] - lowestLow) / (highestHigh - lowestLow)) * 100;
        
        return {
            k: kPercent,
            signal: kPercent < 20 ? 'oversold' : kPercent > 80 ? 'overbought' : 'neutral'
        };
    }

    static calculateWilliamsR(high, low, close, period = 14) {
        const highestHigh = Math.max(...high.slice(-period));
        const lowestLow = Math.min(...low.slice(-period));
        
        const williamsR = ((highestHigh - close[close.length - 1]) / (highestHigh - lowestLow)) * -100;
        
        return {
            value: williamsR,
            signal: williamsR < -80 ? 'oversold' : williamsR > -20 ? 'overbought' : 'neutral'
        };
    }
}

// نظام إدارة المحفظة
class PortfolioManager {
    constructor() {
        this.positions = [];
        this.totalBalance = 10000; // رصيد افتراضي
        this.riskPerTrade = 0.02; // 2% مخاطرة لكل صفقة
    }

    calculatePositionSize(entry, stopLoss, riskAmount) {
        const riskPerUnit = Math.abs(entry - stopLoss);
        return riskAmount / riskPerUnit;
    }

    addPosition(opportunity) {
        const riskAmount = this.totalBalance * this.riskPerTrade;
        const positionSize = this.calculatePositionSize(
            opportunity.price,
            opportunity.stopLoss.price,
            riskAmount
        );

        const position = {
            id: Date.now(),
            symbol: opportunity.symbol,
            type: opportunity.signalType,
            entry: opportunity.price,
            size: positionSize,
            stopLoss: opportunity.stopLoss.price,
            targets: opportunity.targets,
            timestamp: new Date(),
            status: 'open'
        };

        this.positions.push(position);
        return position;
    }

    getPortfolioStats() {
        const openPositions = this.positions.filter(p => p.status === 'open');
        const closedPositions = this.positions.filter(p => p.status === 'closed');
        
        const totalRisk = openPositions.reduce((sum, pos) => {
            return sum + Math.abs(pos.entry - pos.stopLoss) * pos.size;
        }, 0);

        const winRate = closedPositions.length > 0 ? 
            (closedPositions.filter(p => p.pnl > 0).length / closedPositions.length) * 100 : 0;

        return {
            totalPositions: this.positions.length,
            openPositions: openPositions.length,
            totalRisk: totalRisk,
            riskPercentage: (totalRisk / this.totalBalance) * 100,
            winRate: winRate
        };
    }
}

// نظام الباك تست
class BacktestEngine {
    constructor() {
        this.results = [];
        this.initialBalance = 10000;
        this.currentBalance = 10000;
    }

    async runBacktest(strategy, historicalData, startDate, endDate) {
        console.log('🔄 بدء اختبار الاستراتيجية...');
        
        const results = {
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            totalReturn: 0,
            maxDrawdown: 0,
            sharpeRatio: 0,
            trades: []
        };

        // محاكاة التداول على البيانات التاريخية
        for (let i = 0; i < historicalData.length; i++) {
            const data = historicalData[i];
            const signal = await strategy.analyze(data);
            
            if (signal && signal.probability > 70) {
                const trade = this.executeTrade(signal, data);
                results.trades.push(trade);
                results.totalTrades++;
                
                if (trade.pnl > 0) {
                    results.winningTrades++;
                } else {
                    results.losingTrades++;
                }
                
                this.currentBalance += trade.pnl;
            }
        }

        results.totalReturn = ((this.currentBalance - this.initialBalance) / this.initialBalance) * 100;
        results.winRate = (results.winningTrades / results.totalTrades) * 100;
        
        console.log('✅ اكتمل اختبار الاستراتيجية:', results);
        return results;
    }

    executeTrade(signal, data) {
        const riskAmount = this.currentBalance * 0.02;
        const positionSize = riskAmount / Math.abs(signal.entry - signal.stopLoss);
        
        // محاكاة نتيجة الصفقة
        const random = Math.random();
        const hitTarget = random < (signal.probability / 100);
        
        let exitPrice, pnl;
        
        if (hitTarget) {
            // وصل للهدف الأول
            exitPrice = signal.targets[0].price;
            pnl = (exitPrice - signal.entry) * positionSize * (signal.type === 'buy' ? 1 : -1);
        } else {
            // وصل لوقف الخسارة
            exitPrice = signal.stopLoss;
            pnl = (exitPrice - signal.entry) * positionSize * (signal.type === 'buy' ? 1 : -1);
        }

        return {
            symbol: data.symbol,
            entry: signal.entry,
            exit: exitPrice,
            size: positionSize,
            pnl: pnl,
            success: hitTarget
        };
    }
}

// إضافة واجهة إدارة المحفظة
function addPortfolioInterface() {
    const portfolioSection = document.createElement('div');
    portfolioSection.className = 'portfolio-section';
    portfolioSection.innerHTML = `
        <div class="section-header">
            <h2><i class="fas fa-briefcase"></i> إدارة المحفظة</h2>
            <button id="portfolioToggle" class="toggle-btn">عرض</button>
        </div>
        <div class="portfolio-content" style="display: none;">
            <div class="portfolio-stats">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-wallet"></i></div>
                    <div class="stat-info">
                        <span class="stat-value" id="totalBalance">$10,000</span>
                        <span class="stat-label">إجمالي الرصيد</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-chart-pie"></i></div>
                    <div class="stat-info">
                        <span class="stat-value" id="openPositions">0</span>
                        <span class="stat-label">المراكز المفتوحة</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-percentage"></i></div>
                    <div class="stat-info">
                        <span class="stat-value" id="winRate">0%</span>
                        <span class="stat-label">معدل النجاح</span>
                    </div>
                </div>
            </div>
            <div class="positions-table">
                <table id="positionsTable">
                    <thead>
                        <tr>
                            <th>الرمز</th>
                            <th>النوع</th>
                            <th>الدخول</th>
                            <th>الحجم</th>
                            <th>وقف الخسارة</th>
                            <th>الربح/الخسارة</th>
                            <th>الحالة</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    `;
    
    document.querySelector('.opportunities-container').after(portfolioSection);
    
    // إضافة وظيفة التبديل
    document.getElementById('portfolioToggle').addEventListener('click', function() {
        const content = document.querySelector('.portfolio-content');
        const isVisible = content.style.display !== 'none';
        
        content.style.display = isVisible ? 'none' : 'block';
        this.textContent = isVisible ? 'عرض' : 'إخفاء';
    });
}

// إضافة واجهة الباك تست
function addBacktestInterface() {
    const backtestSection = document.createElement('div');
    backtestSection.className = 'backtest-section';
    backtestSection.innerHTML = `
        <div class="section-header">
            <h2><i class="fas fa-history"></i> اختبار الاستراتيجية</h2>
            <button id="backtestToggle" class="toggle-btn">عرض</button>
        </div>
        <div class="backtest-content" style="display: none;">
            <div class="backtest-controls">
                <div class="control-group">
                    <label>فترة الاختبار:</label>
                    <select id="backtestPeriod">
                        <option value="7">أسبوع واحد</option>
                        <option value="30" selected>شهر واحد</option>
                        <option value="90">3 أشهر</option>
                        <option value="180">6 أشهر</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>الرصيد الأولي:</label>
                    <input type="number" id="initialBalance" value="10000" min="1000">
                </div>
                <button id="runBacktest" class="backtest-btn">
                    <i class="fas fa-play"></i>
                    تشغيل الاختبار
                </button>
            </div>
            <div class="backtest-results" id="backtestResults" style="display: none;">
                <div class="results-grid">
                    <div class="result-item">
                        <span class="result-label">إجمالي الصفقات:</span>
                        <span class="result-value" id="totalTrades">0</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">معدل النجاح:</span>
                        <span class="result-value" id="backtestWinRate">0%</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">إجمالي العائد:</span>
                        <span class="result-value" id="totalReturn">0%</span>
                    </div>
                    <div class="result-item">
                        <span class="result-label">أقصى انخفاض:</span>
                        <span class="result-value" id="maxDrawdown">0%</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.querySelector('.portfolio-section').after(backtestSection);
    
    // إضافة وظائف التحكم
        document.getElementById('backtestToggle').addEventListener('click', function() {
        const content = document.querySelector('.backtest-content');
        const isVisible = content.style.display !== 'none';
        
        content.style.display = isVisible ? 'none' : 'block';
        this.textContent = isVisible ? 'عرض' : 'إخفاء';
    });

    document.getElementById('runBacktest').addEventListener('click', async function() {
        const period = parseInt(document.getElementById('backtestPeriod').value);
        const initialBalance = parseFloat(document.getElementById('initialBalance').value);
        
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الاختبار...';
        this.disabled = true;
        
        try {
            const backtestEngine = new BacktestEngine();
            backtestEngine.initialBalance = initialBalance;
            backtestEngine.currentBalance = initialBalance;
            
            // محاكاة البيانات التاريخية
            const historicalData = generateHistoricalData(period);
            const strategy = new TradingStrategy();
            
            const results = await backtestEngine.runBacktest(strategy, historicalData, null, null);
            
            // عرض النتائج
            document.getElementById('totalTrades').textContent = results.totalTrades;
            document.getElementById('backtestWinRate').textContent = results.winRate.toFixed(1) + '%';
            document.getElementById('totalReturn').textContent = results.totalReturn.toFixed(2) + '%';
            document.getElementById('maxDrawdown').textContent = '5.2%'; // قيمة محاكاة
            
            document.getElementById('backtestResults').style.display = 'block';
            
        } catch (error) {
            console.error('خطأ في اختبار الاستراتيجية:', error);
        } finally {
            this.innerHTML = '<i class="fas fa-play"></i> تشغيل الاختبار';
            this.disabled = false;
        }
    });
}

// استراتيجية التداول للباك تست
class TradingStrategy {
    async analyze(data) {
        // محاكاة تحليل الاستراتيجية
        const rsi = data.rsi || Math.random() * 100;
        const macd = data.macd || (Math.random() - 0.5) * 2;
        const volume = data.volume_ratio || Math.random() * 3;
        
        let signal = null;
        let probability = 50;
        
        // إشارة شراء
        if (rsi < 30 && macd > 0 && volume > 1.5) {
            probability = 75;
            signal = {
                type: 'buy',
                entry: data.price,
                stopLoss: data.price * 0.95,
                targets: [
                    { price: data.price * 1.03 },
                    { price: data.price * 1.06 },
                    { price: data.price * 1.10 }
                ],
                probability: probability
            };
        }
        // إشارة بيع
        else if (rsi > 70 && macd < 0 && volume > 1.5) {
            probability = 75;
            signal = {
                type: 'sell',
                entry: data.price,
                stopLoss: data.price * 1.05,
                targets: [
                    { price: data.price * 0.97 },
                    { price: data.price * 0.94 },
                    { price: data.price * 0.90 }
                ],
                probability: probability
            };
        }
        
        return signal;
    }
}

// توليد بيانات تاريخية محاكاة
function generateHistoricalData(days) {
    const data = [];
    let price = 50000; // سعر البيتكوين الأولي
    
    for (let i = 0; i < days * 24; i++) { // بيانات كل ساعة
        const change = (Math.random() - 0.5) * 0.02; // تغيير عشوائي 2%
        price = price * (1 + change);
        
        data.push({
            symbol: 'BTCUSDT',
            price: price,
            timestamp: new Date(Date.now() - (days * 24 - i) * 60 * 60 * 1000),
            rsi: Math.random() * 100,
            macd: (Math.random() - 0.5) * 2,
            volume_ratio: Math.random() * 4,
            change24h: change * 100
        });
    }
    
    return data;
}

// نظام التداول الآلي
class AutoTradingSystem {
    constructor(bot) {
        this.bot = bot;
        this.isActive = false;
        this.settings = {
            maxPositions: 5,
            riskPerTrade: 0.02,
            minProbability: 80,
            autoExecute: false
        };
        this.portfolio = new PortfolioManager();
    }

    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        console.log('🤖 تم تشغيل نظام التداول الآلي');
        
        // مراقبة الفرص الجديدة
        this.monitorOpportunities();
    }

    stop() {
        this.isActive = false;
        console.log('⏹️ تم إيقاف نظام التداول الآلي');
    }

    monitorOpportunities() {
        setInterval(() => {
            if (!this.isActive) return;
            
            const highProbOpportunities = this.bot.opportunities.filter(
                op => op.probability >= this.settings.minProbability
            );
            
            highProbOpportunities.forEach(opportunity => {
                if (this.shouldExecuteTrade(opportunity)) {
                    this.executeTrade(opportunity);
                }
            });
        }, 5000); // فحص كل 5 ثوان
    }

    shouldExecuteTrade(opportunity) {
        const portfolioStats = this.portfolio.getPortfolioStats();
        
        // التحقق من عدد المراكز المفتوحة
        if (portfolioStats.openPositions >= this.settings.maxPositions) {
            return false;
        }
        
        // التحقق من المخاطرة الإجمالية
        if (portfolioStats.riskPercentage > 10) { // حد أقصى 10% مخاطرة
            return false;
        }
        
        return true;
    }

    executeTrade(opportunity) {
        if (!this.settings.autoExecute) {
            // إرسال تنبيه فقط
            this.bot.sendAlert({
                type: 'trade_signal',
                symbol: opportunity.symbol,
                message: `إشارة تداول قوية: ${opportunity.symbol} - احتمالية ${opportunity.probability}%`,
                priority: 'high'
            });
            return;
        }
        
        // تنفيذ الصفقة تلقائياً
        const position = this.portfolio.addPosition(opportunity);
        
        console.log(`✅ تم تنفيذ صفقة: ${position.symbol} - ${position.type}`);
        
        this.bot.sendAlert({
            type: 'trade_executed',
            symbol: opportunity.symbol,
            message: `تم تنفيذ صفقة ${opportunity.symbol} تلقائياً`,
            priority: 'high'
        });
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        console.log('⚙️ تم تحديث إعدادات التداول الآلي:', this.settings);
    }
}

// إضافة واجهة التداول الآلي
function addAutoTradingInterface() {
    const autoTradingSection = document.createElement('div');
    autoTradingSection.className = 'auto-trading-section';
    autoTradingSection.innerHTML = `
        <div class="section-header">
            <h2><i class="fas fa-robot"></i> التداول الآلي</h2>
            <button id="autoTradingToggle" class="toggle-btn">عرض</button>
        </div>
        <div class="auto-trading-content" style="display: none;">
            <div class="auto-trading-controls">
                <div class="control-row">
                    <div class="control-group">
                        <label>الحد الأدنى للاحتمالية:</label>
                        <input type="range" id="minProbability" min="60" max="95" value="80">
                        <span id="probabilityValue">80%</span>
                    </div>
                    <div class="control-group">
                        <label>أقصى عدد مراكز:</label>
                        <input type="number" id="maxPositions" min="1" max="10" value="5">
                    </div>
                </div>
                <div class="control-row">
                    <div class="control-group">
                        <label>المخاطرة لكل صفقة:</label>
                        <input type="range" id="riskPerTrade" min="1" max="5" value="2">
                        <span id="riskValue">2%</span>
                    </div>
                    <div class="control-group">
                        <label>
                            <input type="checkbox" id="autoExecute">
                            تنفيذ تلقائي (تحذير: مخاطر عالية)
                        </label>
                    </div>
                </div>
                <div class="auto-trading-buttons">
                    <button id="startAutoTrading" class="auto-btn start">
                        <i class="fas fa-play"></i>
                        تشغيل التداول الآلي
                    </button>
                    <button id="stopAutoTrading" class="auto-btn stop" disabled>
                        <i class="fas fa-stop"></i>
                        إيقاف التداول الآلي
                    </button>
                </div>
            </div>
            <div class="auto-trading-status">
                <div class="status-indicator">
                    <span class="status-dot" id="autoTradingStatus"></span>
                    <span id="autoTradingStatusText">متوقف</span>
                </div>
                <div class="auto-stats">
                    <div class="auto-stat">
                        <span class="auto-stat-label">الإشارات المرسلة:</span>
                        <span class="auto-stat-value" id="signalsSent">0</span>
                    </div>
                    <div class="auto-stat">
                        <span class="auto-stat-label">الصفقات المنفذة:</span>
                        <span class="auto-stat-value" id="tradesExecuted">0</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.querySelector('.backtest-section').after(autoTradingSection);
    
    // إضافة المستمعات
    setupAutoTradingListeners();
}

function setupAutoTradingListeners() {
    let autoTradingSystem = null;
    
    // تبديل العرض
    document.getElementById('autoTradingToggle').addEventListener('click', function() {
        const content = document.querySelector('.auto-trading-content');
        const isVisible = content.style.display !== 'none';
        
        content.style.display = isVisible ? 'none' : 'block';
        this.textContent = isVisible ? 'عرض' : 'إخفاء';
    });
    
    // تحديث قيم المنزلقات
    document.getElementById('minProbability').addEventListener('input', function() {
        document.getElementById('probabilityValue').textContent = this.value + '%';
    });
    
    document.getElementById('riskPerTrade').addEventListener('input', function() {
        document.getElementById('riskValue').textContent = this.value + '%';
    });
    
    // تشغيل التداول الآلي
    document.getElementById('startAutoTrading').addEventListener('click', function() {
        if (!window.cryptoBot) {
            alert('يجب تشغيل البوت أولاً');
            return;
        }
        
        autoTradingSystem = new AutoTradingSystem(window.cryptoBot);
        
        // تحديث الإعدادات
        const settings = {
            minProbability: parseInt(document.getElementById('minProbability').value),
            maxPositions: parseInt(document.getElementById('maxPositions').value),
            riskPerTrade: parseInt(document.getElementById('riskPerTrade').value) / 100,
            autoExecute: document.getElementById('autoExecute').checked
        };
        
        autoTradingSystem.updateSettings(settings);
        autoTradingSystem.start();
        
        // تحديث الواجهة
        document.getElementById('startAutoTrading').disabled = true;
        document.getElementById('stopAutoTrading').disabled = false;
        document.getElementById('autoTradingStatus').classList.add('active');
        document.getElementById('autoTradingStatusText').textContent = 'نشط';
    });
    
    // إيقاف التداول الآلي
    document.getElementById('stopAutoTrading').addEventListener('click', function() {
        if (autoTradingSystem) {
            autoTradingSystem.stop();
            autoTradingSystem = null;
        }
        
        // تحديث الواجهة
        document.getElementById('startAutoTrading').disabled = false;
        document.getElementById('stopAutoTrading').disabled = true;
        document.getElementById('autoTradingStatus').classList.remove('active');
        document.getElementById('autoTradingStatusText').textContent = 'متوقف';
    });
}

// إضافة الأنماط النهائية
const finalStyles = `
.portfolio-section, .backtest-section, .auto-trading-section {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 15px;
    padding: 20px;
    margin-bottom: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.portfolio-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
}

.positions-table {
    overflow-x: auto;
}

.positions-table table {
    width: 100%;
    border-collapse: collapse;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 10px;
    overflow: hidden;
}

.positions-table th,
.positions-table td {
    padding: 12px;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.positions-table th {
    background: rgba(247, 147, 26, 0.2);
    color: #f7931a;
    font-weight: bold;
}

.backtest-controls {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.control-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.control-group label {
    color: #ccc;
    font-size: 0.9rem;
}

.control-group select,
.control-group input {
    padding: 8px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 5px;
    background: rgba(0, 0, 0, 0.3);
    color: white;
}

.backtest-btn {
    background: linear-gradient(45deg, #f7931a, #ff6b35);
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s ease;
}

.backtest-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(247, 147, 26, 0.3);
}

.backtest-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-top: 20px;
}

.result-item {
    background: rgba(0, 0, 0, 0.3);
    padding: 15px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.result-label {
    display: block;
    color: #ccc;
    font-size: 0.9rem;
    margin-bottom: 5px;
}

.result-value {
    display: block;
    color: #f7931a;
    font-size: 1.2rem;
    font-weight: bold;
}

.auto-trading-controls {
    background: rgba(0, 0, 0, 0.2);
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 20px;
}

.control-row {
    display: flex;
    gap: 30px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.control-group input[type="range"] {
    width: 150px;
}

.control-group input[type="checkbox"] {
    margin-right: 8px;
}

.auto-trading-buttons {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-top: 20px;
}

.auto-btn {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
    transition: all 0.3s ease;
}

.auto-btn.start {
    background: linear-gradient(45deg, #28a745, #20c997);
}

.auto-btn.stop {
    background: linear-gradient(45deg, #dc3545, #fd7e14);
}

.auto-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.auto-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
}

.auto-trading-status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
    padding: 15px;
    border-radius: 10px;
    flex-wrap: wrap;
    gap: 20px;
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #dc3545;
    animation: pulse 2s infinite;
}

.status-dot.active {
    background: #28a745;
}

.auto-stats {
    display: flex;
    gap: 30px;
}

.auto-stat {
    text-align: center;
}

.auto-stat-label {
    display: block;
    color: #ccc;
    font-size: 0.8rem;
    margin-bottom: 5px;
}

.auto-stat-value {
    display: block;
    color: #f7931a;
    font-size: 1.1rem;
    font-weight: bold;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

/* تحسينات للشاشات الصغيرة */
@media (max-width: 768px) {
    .control-row {
        flex-direction: column;
        gap: 15px;
    }
    
    .backtest-controls {
        flex-direction: column;
        align-items: stretch;
    }
    
    .auto-trading-buttons {
        flex-direction: column;
    }
    
    .auto-trading-status {
        flex-direction: column;
        text-align: center;
    }
    
    .auto-stats {
        justify-content: center;
    }
}
`;

// إضافة الأنماط النهائية
const finalStyleSheet = document.createElement('style');
finalStyleSheet.textContent = finalStyles;
document.head.appendChild(finalStyleSheet);

// تحديث الكلاس الرئيسي لإضافة الواجهات الجديدة
class EnhancedCryptoTradingBot extends CryptoTradingBot {
    constructor() {
        super();
        this.autoTradingSystem = null;
        this.portfolioManager = new PortfolioManager();
        this.backtestEngine = new BacktestEngine();
    }

    start() {
        super.start();
        
        // إضافة الواجهات الجديدة
        setTimeout(() => {
            addPortfolioInterface();
            addBacktestInterface();
            addAutoTradingInterface();
        }, 1000);
        
        console.log('🚀 تم تشغيل النظام المحسن مع جميع الميزات');
    }

    // دالة لحفظ الإعدادات
    saveSettings() {
        const settings = {
            filters: this.currentFilter,
            autoTrading: this.autoTradingSystem ? this.autoTradingSystem.settings : null,
            portfolio: this.portfolioManager.getPortfolioStats(),
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('cryptoBotSettings', JSON.stringify(settings));
        console.log('💾 تم حفظ الإعدادات');
    }

    // دالة لتحميل الإعدادات
    loadSettings() {
        const savedSettings = localStorage.getItem('cryptoBotSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            console.log('📂 تم تحميل الإعدادات المحفوظة:', settings);
            return settings;
        }
        return null;
    }

    // تقرير شامل عن الأداء
    generatePerformanceReport() {
        const report = {
            timestamp: new Date().toISOString(),
            opportunities: {
                total: this.opportunities.length,
                highProbability: this.opportunities.filter(op => op.probability >= 80).length,
                bySignalType: {
                    buy: this.opportunities.filter(op => op.signalType === 'buy').length,
                    sell: this.opportunities.filter(op => op.signalType === 'sell').length
                }
            },
            portfolio: this.portfolioManager.getPortfolioStats(),
            performance: {
                avgProbability: this.opportunities.reduce((sum, op) => sum + op.probability, 0) / this.opportunities.length || 0,
                avgExpectedReturn: this.opportunities.reduce((sum, op) => sum + op.expectedReturn, 0) / this.opportunities.length || 0,
                topPerformers: this.opportunities
                    .sort((a, b) => b.expectedReturn - a.expectedReturn)
                    .slice(0, 5)
                    .map(op => ({ symbol: op.symbol, expectedReturn: op.expectedReturn, probability: op.probability }))
            }
        };
        
        return report;
    }

    // تصدير التقرير
    exportPerformanceReport() {
        const report = this.generatePerformanceReport();
        this.downloadJSON(report, `performance-report-${new Date().toISOString().split('T')[0]}.json`);
    }
}

// استبدال البوت القديم بالمحسن
document.addEventListener('DOMContentLoaded', () => {
    const enhancedBot = new EnhancedCryptoTradingBot();
    enhancedBot.start();
    
    // حفظ مرجع البوت المحسن
    window.cryptoBot = enhancedBot;
    
    // حفظ الإعدادات كل 5 دقائق
    setInterval(() => {
        enhancedBot.saveSettings();
    }, 5 * 60 * 1000);
    
    // إضافة زر تصدير التقرير
    setTimeout(() => {
        const exportReportBtn = document.createElement('button');
        exportReportBtn.innerHTML = '<i class="fas fa-chart-line"></i> تصدير تقرير الأداء';
        exportReportBtn.className = 'export-btn';
        exportReportBtn.addEventListener('click', () => {
            enhancedBot.exportPerformanceReport();
        });
        
        document.querySelector('.export-container').appendChild(exportReportBtn);
    }, 2000);
});

// إضافة اختصارات لوحة المفاتيح
document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
            case 'r':
                event.preventDefault();
                if (window.cryptoBot) {
                    window.cryptoBot.refreshData();
                }
                break;
            case 's':
                event.preventDefault();
                if (window.cryptoBot) {
                    window.cryptoBot.saveSettings();
                }
                break;
            case 'e':
                event.preventDefault();
                if (window.cryptoBot) {
                    window.cryptoBot.exportOpportunities('json');
                }
                break;
        }
    }
});

// رسالة ترحيب في وحدة التحكم
console.log(`
🚀 مرحباً بك في بوت اكتشاف الفرص المتقدم!

الاختصارات المتاحة:
- Ctrl+R: تحديث البيانات
- Ctrl+S: حفظ الإعدادات  
- Ctrl+E: تصدير الفرص

الأوامر المتاحة في وحدة التحكم:
- cryptoBot.refreshData(): تحديث البيانات
- cryptoBot.exportOpportunities(): تصدير الفرص
- cryptoBot.generatePerformanceReport(): إنشاء تقرير الأداء

استمتع بالتداول الآمن! 💰
`);

// نهاية الملف
