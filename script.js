class BinanceTradingBot {
    constructor() {
        this.wsConnection = null;
        this.symbols = [];
        this.marketData = new Map();
        this.opportunities = [];
        this.isConnected = false;
        this.analysisType = 'swing';
        this.minVolume = 1000000;
        this.riskLevel = 'medium';
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadSymbols();
        this.connectWebSocket();
        this.startAnalysis();
    }

    setupEventListeners() {
        // تحديث نوع التحليل
        document.getElementById('analysisType').addEventListener('change', (e) => {
            this.analysisType = e.target.value;
            this.analyzeMarket();
        });

        // تحديث الحد الأدنى للحجم
        document.getElementById('minVolume').addEventListener('input', (e) => {
            this.minVolume = parseFloat(e.target.value) || 1000000;
            this.analyzeMarket();
        });

        // تحديث مستوى المخاطرة
        document.getElementById('riskLevel').addEventListener('change', (e) => {
            this.riskLevel = e.target.value;
            this.analyzeMarket();
        });

        // زر التحديث
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        // فلاتر الفرص
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.filterOpportunities(e.target.dataset.filter);
            });
        });
    }

    async loadSymbols() {
        try {
            const response = await fetch('https://api1.binance.com/api/v3/exchangeInfo');
            const data = await response.json();
            
            // فلترة الرموز النشطة فقط مع USDT
            this.symbols = data.symbols
                .filter(symbol => 
                    symbol.status === 'TRADING' && 
                    symbol.symbol.endsWith('USDT') &&
                    !symbol.symbol.includes('UP') &&
                    !symbol.symbol.includes('DOWN') &&
                    !symbol.symbol.includes('BULL') &&
                    !symbol.symbol.includes('BEAR')
                )
                .map(symbol => symbol.symbol)
                .slice(0, 100); // أخذ أول 100 رمز لتجنب الحمل الزائد

            console.log(`تم تحميل ${this.symbols.length} رمز للتحليل`);
        } catch (error) {
            console.error('خطأ في تحميل الرموز:', error);
        }
    }

    connectWebSocket() {
        const streams = this.symbols.map(symbol => `${symbol.toLowerCase()}@ticker`).join('/');
        const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;
        
        this.wsConnection = new WebSocket(wsUrl);
        
        this.wsConnection.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            console.log('تم الاتصال بـ Binance WebSocket');
        };

        this.wsConnection.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.updateMarketData(data);
        };

        this.wsConnection.onclose = () => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            console.log('انقطع الاتصال مع Binance WebSocket');
            // إعادة الاتصال بعد 5 ثوان
            setTimeout(() => this.connectWebSocket(), 5000);
        };

        this.wsConnection.onerror = (error) => {
            console.error('خطأ في WebSocket:', error);
        };
    }

    updateMarketData(tickerData) {
        const symbol = tickerData.s;
        const data = {
            symbol: symbol,
            price: parseFloat(tickerData.c),
            change: parseFloat(tickerData.P),
            volume: parseFloat(tickerData.v),
            quoteVolume: parseFloat(tickerData.q),
            high: parseFloat(tickerData.h),
            low: parseFloat(tickerData.l),
            open: parseFloat(tickerData.o),
            timestamp: Date.now()
        };

        this.marketData.set(symbol, data);
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('statusText');
        
        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'متصل';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'غير متصل';
        }
    }

    async getKlineData(symbol, interval, limit = 100) {
        try {
            const response = await fetch(
                `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
            );
            const data = await response.json();
            
            return data.map(kline => ({
                time: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5])
            }));
        } catch (error) {
            console.error(`خطأ في جلب بيانات ${symbol}:`, error);
            return [];
        }
    }

    calculateTechnicalIndicators(klineData) {
        if (klineData.length < 50) return null;

        const closes = klineData.map(k => k.close);
        const highs = klineData.map(k => k.high);
        const lows = klineData.map(k => k.low);
        const volumes = klineData.map(k => k.volume);

        try {
            // Moving Averages
            const sma20 = this.calculateSMA(closes, 20);
            const sma50 = this.calculateSMA(closes, 50);
            const ema12 = this.calculateEMA(closes, 12);
            const ema26 = this.calculateEMA(closes, 26);

            // RSI
            const rsi = this.calculateRSI(closes, 14);

            // MACD
            const macd = this.calculateMACD(closes);

            // Bollinger Bands
            const bb = this.calculateBollingerBands(closes, 20, 2);

            // Volume indicators
            const volumeSMA = this.calculateSMA(volumes, 20);

            return {
                sma20: sma20[sma20.length - 1],
                sma50: sma50[sma50.length - 1],
                ema12: ema12[ema12.length - 1],
                ema26: ema26[ema26.length - 1],
                rsi: rsi[rsi.length - 1],
                macd: macd,
                bollingerBands: bb,
                volumeRatio: volumes[volumes.length - 1] / volumeSMA[volumeSMA.length - 1]
            };
        } catch (error) {
            console.error('خطأ في حساب المؤشرات الفنية:', error);
            return null;
        }
    }

    calculateSMA(data, period) {
        const result = [];
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
        return result;
    }

    calculateEMA(data, period) {
        const result = [];
        const multiplier = 2 / (period + 1);
        result[0] = data[0];

        for (let i = 1; i < data.length; i++) {
            result[i] = (data[i] * multiplier) + (result[i - 1] * (1 - multiplier));
        }
        return result;
    }

    calculateRSI(data, period) {
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }

        const avgGains = this.calculateSMA(gains, period);
        const avgLosses = this.calculateSMA(losses, period);
        
        return avgGains.map((gain, i) => {
            const rs = gain / avgLosses[i];
            return 100 - (100 / (1 + rs));
        });
    }

    calculateMACD(data) {
        const ema12 = this.calculateEMA(data, 12);
        const ema26 = this.calculateEMA(data, 26);
        const macdLine = ema12.map((val, i) => val - ema26[i]);
        const signalLine = this.calculateEMA(macdLine, 9);
        const histogram = macdLine.map((val, i) => val - signalLine[i]);

        return {
            macd: macdLine[macdLine.length - 1],
            signal: signalLine[signalLine.length - 1],
            histogram: histogram[histogram.length - 1]
        };
    }

    calculateBollingerBands(data, period, stdDev) {
        const sma = this.calculateSMA(data, period);
        const result = [];

        for (let i = period - 1; i < data.length; i++) {
            const slice = data.slice(i - period + 1, i + 1);
            const mean = sma[i - period + 1];
            const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
            const standardDeviation = Math.sqrt(variance);

            result.push({
                upper: mean + (standardDeviation * stdDev),
                middle: mean,
                lower: mean - (standardDeviation * stdDev)
            });
        }

        return result[result.length - 1];
    }

    async analyzeSymbol(symbol) {
        const marketData = this.marketData.get(symbol);
        if (!marketData || marketData.quoteVolume < this.minVolume) {
            return null;
        }

        // تحديد الفترة الزمنية حسب نوع التحليل
        let interval;
        switch (this.analysisType) {
            case 'scalping':
                interval = '1m';
                break;
            case 'swing':
                interval = '15m';
                break;
            case 'position':
                interval = '4h';
                break;
            default:
                interval = '15m';
        }

        const klineData = await this.getKlineData(symbol, interval);
        if (klineData.length < 50) return null;

        const indicators = this.calculateTechnicalIndicators(klineData);
        if (!indicators) return null;

        const currentPrice = marketData.price;
        const signals = this.generateTradingSignals(indicators, currentPrice, marketData);

        if (signals.score < 60) return null; // فقط الإشارات القوية

        return {
            symbol,
            price: currentPrice,
            change: marketData.change,
            volume: marketData.quoteVolume,
            signal: signals.direction,
            probability: signals.score,
            entryPrice: signals.entryPrice,
            stopLoss: signals.stopLoss,
            takeProfit: signals.takeProfit,
            potentialProfit: signals.potentialProfit,
            indicators: {
                rsi: indicators.rsi.toFixed(2),
                macd: indicators.macd.macd.toFixed(4),
                bb: indicators.bollingerBands
            },
            timestamp: Date.now()
        };
    }

    generateTradingSignals(indicators, currentPrice, marketData) {
        let score = 0;
        let direction = 'hold';
        let signals = [];

        // تحليل RSI
        if (indicators.rsi < 30) {
            score += 25;
            signals.push('RSI oversold');
            direction = 'buy';
        } else if (indicators.rsi > 70) {
            score += 25;
            signals.push('RSI overbought');
            direction = 'sell';
        }

        // تحليل MACD
        if (indicators.macd.macd > indicators.macd.signal && indicators.macd.histogram > 0) {
            score += 20;
            signals.push('MACD bullish');
            if (direction !== 'sell') direction = 'buy';
        } else if (indicators.macd.macd < indicators.macd.signal && indicators.macd.histogram < 0) {
            score += 20;
            signals.push('MACD bearish');
            if (direction !== 'buy') direction = 'sell';
        }

        // تحليل Bollinger Bands
        if (currentPrice <= indicators.bollingerBands.lower) {
            score += 15;
            signals.push('BB oversold');
            if (direction !== 'sell') direction = 'buy';
        } else if (currentPrice >= indicators.bollingerBands.upper) {
            score += 15;
            signals.push('BB overbought');
            if (direction !== 'buy') direction = 'sell';
        }

        // تحليل المتوسطات المتحركة
        if (indicators.ema12 > indicators.ema26 && currentPrice > indicators.sma20) {
            score += 15;
            signals.push('MA bullish');
            if (direction !== 'sell') direction = 'buy';
        } else if (indicators.ema12 < indicators.ema26 && currentPrice < indicators.sma20) {
            score += 15;
            signals.push('MA bearish');
            if (direction !== 'buy') direction = 'sell';
        }

        // تحليل الحجم
        if (indicators.volumeRatio > 1.5) {
            score += 10;
            signals.push('High volume');
        }

        // تحديد نقاط الدخول والخروج
        let entryPrice, stopLoss, takeProfit, potentialProfit;
        if (direction === 'buy') {
            entryPrice = currentPrice;
            stopLoss = Math.min(indicators.bollingerBands.lower, currentPrice * 0.97);
            takeProfit = Math.max(indicators.bollingerBands.upper, currentPrice * 1.06);
            potentialProfit = ((takeProfit - entryPrice) / entryPrice) * 100;
        } else if (direction === 'sell') {
            entryPrice = currentPrice;
            stopLoss = Math.max(indicators.bollingerBands.upper, currentPrice * 1.03);
            takeProfit = Math.min(indicators.bollingerBands.lower, currentPrice * 0.94);
            potentialProfit = ((entryPrice - takeProfit) / entryPrice) * 100;
        } else {
            entryPrice = currentPrice;
            stopLoss = currentPrice;
            takeProfit = currentPrice;
            potentialProfit = 0;
        }

        // تعديل النقاط حسب مستوى المخاطرة
        const riskMultiplier = this.getRiskMultiplier();
        if (direction === 'buy') {
            stopLoss = currentPrice - (currentPrice - stopLoss) * riskMultiplier;
            takeProfit = currentPrice + (takeProfit - currentPrice) * riskMultiplier;
        } else if (direction === 'sell') {
            stopLoss = currentPrice + (stopLoss - currentPrice) * riskMultiplier;
            takeProfit = currentPrice - (currentPrice - takeProfit) * riskMultiplier;
        }

        return {
            direction,
            score: Math.min(score, 100),
            entryPrice,
            stopLoss,
            takeProfit,
            potentialProfit: Math.abs(potentialProfit),
            signals
        };
    }

    getRiskMultiplier() {
        switch (this.riskLevel) {
            case 'low': return 0.5;
            case 'medium': return 1.0;
            case 'high': return 1.5;
            default: return 1.0;
        }
    }

    async startAnalysis() {
        this.showLoading(true);
        
        // انتظار تحميل البيانات الأولية
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        await this.analyzeMarket();
        this.showLoading(false);

        // تحديث دوري كل 30 ثانية
        setInterval(() => {
            this.analyzeMarket();
        }, 30000);
    }

    async analyzeMarket() {
        if (!this.isConnected || this.marketData.size === 0) {
            return;
        }

        console.log('بدء تحليل السوق...');
        const opportunities = [];

        // تحليل كل رمز
        for (const symbol of this.symbols) {
            try {
                const analysis = await this.analyzeSymbol(symbol);
                if (analysis) {
                    opportunities.push(analysis);
                }
                
                // تأخير صغير لتجنب تجاوز حدود API
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`خطأ في تحليل ${symbol}:`, error);
            }
        }

        // ترتيب الفرص حسب الاحتمالية والربح المحتمل
        this.opportunities = opportunities
            .sort((a, b) => {
                const scoreA = a.probability * 0.7 + a.potentialProfit * 0.3;
                const scoreB = b.probability * 0.7 + b.potentialProfit * 0.3;
                return scoreB - scoreA;
            })
            .slice(0, 30); // أفضل 30 فرصة

        this.updateUI();
        console.log(`تم العثور على ${this.opportunities.length} فرصة تداول`);
    }

    updateUI() {
        this.updateStats();
        this.displayOpportunities();
        this.updateLastUpdateTime();
    }

    updateStats() {
        const totalOpportunities = this.opportunities.length;
        const highProbability = this.opportunities.filter(op => op.probability >= 80).length;
        const avgPotential = totalOpportunities > 0 
            ? (this.opportunities.reduce((sum, op) => sum + op.potentialProfit, 0) / totalOpportunities).toFixed(2)
            : 0;

        document.getElementById('totalOpportunities').textContent = totalOpportunities;
        document.getElementById('highProbability').textContent = highProbability;
        document.getElementById('avgPotential').textContent = `${avgPotential}%`;
    }

    displayOpportunities() {
        const grid = document.getElementById('opportunitiesGrid');
        grid.innerHTML = '';

        this.opportunities.forEach(opportunity => {
            const card = this.createOpportunityCard(opportunity);
            grid.appendChild(card);
        });
    }

    createOpportunityCard(opportunity) {
        const card = document.createElement('div');
        card.className = `opportunity-card ${opportunity.signal}`;
        card.dataset.signal = opportunity.signal;
        card.dataset.probability = opportunity.probability >= 80 ? 'high' : 'medium';

        const probabilityClass = opportunity.probability >= 80 ? 'probability-high' : 
                               opportunity.probability >= 60 ? 'probability-medium' : 'probability-low';

        card.innerHTML = `
            <div class="opportunity-header">
                <div class="symbol">${opportunity.symbol}</div>
                <div class="signal-type ${opportunity.signal}">${opportunity.signal === 'buy' ? 'شراء' : 'بيع'}</div>
            </div>
            
            <div class="price-info">
                <div class="price-item">
                    <div class="price-label">السعر الحالي</div>
                    <div class="price-value">$${opportunity.price.toFixed(4)}</div>
                </div>
                <div class="price-item">
                    <div class="price-label">التغيير 24س</div>
                    <div class="price-value" style="color: ${opportunity.change >= 0 ? '#27ae60' : '#e74c3c'}">
                        ${opportunity.change >= 0 ? '+' : ''}${opportunity.change.toFixed(2)}%
                    </div>
                </div>
            </div>

            <div class="price-info">
                <div class="price-item">
                    <div class="price-label">نقطة الدخول</div>
                    <div class="price-value">$${opportunity.entryPrice.toFixed(4)}</div>
                </div>
                <div class="price-item">
                    <div class="price-label">وقف الخسارة</div>
                    <div class="price-value">$${opportunity.stopLoss.toFixed(4)}</div>
                </div>
            </div>

            <div class="price-info">
                <div class="price-item">
                    <div class="price-label">جني الأرباح</div>
                    <div class="price-value">$${opportunity.takeProfit.toFixed(4)}</div>
                </div>
                <div class="price-item">
                    <div class="price-label">الربح المتوقع</div>
                    <div class="price-value" style="color: #27ae60">+${opportunity.potentialProfit.toFixed(2)}%</div>
                </div>
            </div>

            <div class="indicators">
                <div class="indicator">
                    <div class="indicator-label">RSI</div>
                    <div class="indicator-value">${opportunity.indicators.rsi}</div>
                </div>
                <div class="indicator">
                    <div class="indicator-label">MACD</div>
                    <div class="indicator-value">${opportunity.indicators.macd}</div>
                </div>
                <div class="indicator">
                    <div class="indicator-label">الاحتمالية</div>
                    <div class="indicator-value">${opportunity.probability.toFixed(0)}%</div>
                </div>
            </div>

            <div class="probability-bar">
                <div class="probability-fill ${probabilityClass}" style="width: ${opportunity.probability}%"></div>
            </div>

            <div class="opportunity-footer">
                <div class="volume">الحجم: $${this.formatNumber(opportunity.volume)}</div>
                <div class="potential-profit">+${opportunity.potentialProfit.toFixed(2)}%</div>
            </div>
        `;

        return card;
    }

    formatNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    }

    filterOpportunities(filter) {
        const cards = document.querySelectorAll('.opportunity-card');
        
        cards.forEach(card => {
            let show = false;
            
            switch (filter) {
                case 'all':
                    show = true;
                    break;
                case 'buy':
                    show = card.dataset.signal === 'buy';
                    break;
                case 'sell':
                    show = card.dataset.signal === 'sell';
                    break;
                case 'high-prob':
                    show = card.dataset.probability === 'high';
                    break;
            }
            
            card.style.display = show ? 'block' : 'none';
        });
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('lastUpdate').textContent = timeString;
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
        this.showLoading(true);
        
        // إعادة تحميل الرموز
        await this.loadSymbols();
        
        // إعادة تحليل السوق
        await this.analyzeMarket();
        
        this.showLoading(false);
        
        // إظهار رسالة نجاح
        this.showNotification('تم تحديث البيانات بنجاح', 'success');
    }

    showNotification(message, type = 'info') {
        // إنشاء عنصر الإشعار
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        // إضافة الأنماط
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#27ae60' : '#3498db'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1001;
            display: flex;
            align-items: center;
            gap: 10px;
            font-family: 'Cairo', sans-serif;
            font-weight: 600;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // إظهار الإشعار
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // إخفاء الإشعار بعد 3 ثوان
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// بدء تشغيل البوت عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.tradingBot = new BinanceTradingBot();
});

// إضافة مستمع لإغلاق الاتصال عند إغلاق الصفحة
window.addEventListener('beforeunload', () => {
    if (window.tradingBot && window.tradingBot.wsConnection) {
        window.tradingBot.wsConnection.close();
    }
});
