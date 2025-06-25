// Ensure technicalindicators is loaded via CDN in HTML:
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

    init() {
        this.setupEventListeners();
        this.connectToAPI();
        this.startAutoUpdate();
    }

    setupEventListeners() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData();
        });

        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.setActiveFilter(e.target.dataset.filter);
            });
        });

        document.getElementById('analysisType').addEventListener('change', () => {
            this.refreshData();
        });

        document.getElementById('riskLevel').addEventListener('change', () => {
            this.refreshData();
        });

        document.getElementById('minVolume').addEventListener('change', () => {
            this.refreshData();
        });
    }

    async connectToAPI() {
        try {
            this.showLoading(true);
            this.isConnected = false;

            const symbols = await this.getBinanceSymbols();
            const streams = symbols.map(symbol => `${symbol.toLowerCase()}@kline_1m`).join('/');
            this.ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streams}`);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus();
                console.log('Connected to Binance WebSocket');
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
                    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=100`
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

            let symbolData = this.historicalData.get(symbol) || [];
            symbolData.push(candle);
            if (symbolData.length > 100) symbolData.shift();
            this.historicalData.set(symbol, symbolData);

            const tickerResponse = await fetch(
                `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
            );
            const tickerData = await tickerResponse.json();

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
                    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
                );
                const tickerData = await tickerResponse.json();

                const klineResponse = await fetch(
                    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=1`
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

        // Use technicalindicators from global scope (loaded via CDN)
        const { RSI, MACD, BollingerBands } = window.technicalindicators;

        const rsi = RSI.calculate({
            values: closes,
            period: 14
        }).slice(-1)[0] || 50;

        const macdResult = MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9
        }).slice(-1)[0];
        const macd = macdResult ? macdResult.MACD : 0;

        const bb = BollingerBands.calculate({
            period: 20,
            values: closes,
            stdDev: 2
        }).slice(-1)[0];
        const bb_position = bb ? (candle.close - bb.lower) / (bb.upper - bb.lower) : 0.5;

        const avgVolume = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
        const volume_ratio = candle.volume / (avgVolume || 1);

        // Calculate support and resistance using recent highs/lows
        const recentHigh = Math.max(...highs.slice(-20));
        const recentLow = Math.min(...lows.slice(-20));

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
            support: recentLow,
            resistance: recentHigh
        };
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

    stop() {
        this.stopAutoUpdate();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        console.log('⏹️ تم إيقاف بوت اكتشاف الفرص');
    }

    // ... (Other methods like analyzeOpportunities, performTechnicalAnalysis, etc., remain unchanged)
}

// EnhancedCryptoTradingBot (unchanged except for constructor)
class EnhancedCryptoTradingBot extends CryptoTradingBot {
    constructor() {
        super();
        this.autoTradingSystem = null;
        this.portfolioManager = new PortfolioManager();
        this.backtestEngine = new BacktestEngine();
    }

    start() {
        super.start();
        
        setTimeout(() => {
            addPortfolioInterface();
            addBacktestInterface();
            addAutoTradingInterface();
        }, 1000);
        
        console.log('🚀 تم تشغيل النظام المحسن مع جميع الميزات');
    }

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

    loadSettings() {
        const savedSettings = localStorage.getItem('cryptoBotSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            console.log('📂 تم تحميل الإعدادات المحفوظة:', settings);
            return settings;
        }
        return null;
    }

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

    exportPerformanceReport() {
        const report = this.generatePerformanceReport();
        this.downloadJSON(report, `performance-report-${new Date().toISOString().split('T')[0]}.json`);
    }
}

// Start the bot
document.addEventListener('DOMContentLoaded', () => {
    const enhancedBot = new EnhancedCryptoTradingBot();
    enhancedBot.start();
    window.cryptoBot = enhancedBot;
    
    setInterval(() => {
        enhancedBot.saveSettings();
    }, 5 * 60 * 1000);
    
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

// Keyboard shortcuts (unchanged)
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

// Console welcome message (unchanged)
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
