# SpikeIQ US — Trade Analytics Platform

GitHub: [akram1089/spikeiq_us](https://github.com/akram1089/spikeiq_us)  
Production domain: [https://spikeiq.chickenkiller.com/](https://spikeiq.chickenkiller.com/)

This project establishes a complete local development and testing environment for integrating with Interactive Brokers (IB) Gateway. It uses Docker Compose to run the IB Gateway, Python 3.12, and the `ib_insync` library to validate connections, retrieve account information, check contracts, fetch historical candlesticks, and stream real-time ticks and bars.

---

## Section 1: Project Structure

The project layout is structured logically to separate configurations, container environments, and Python application modules:

```text
trade-analytics-us/
├── config/
│   └── settings.py              # Environment configuration & variables loading
├── docker/
│   ├── docker-compose.yml       # Docker Compose file for the IB Gateway service
│   └── .env.example             # Template for Docker environment variables
├── logs/
│   └── ib_gateway.log           # Rotation-based log files (created on run)
├── src/
│   ├── utils/
│   │   ├── __init__.py
│   │   └── logger.py            # Loguru global logging setup
│   ├── __init__.py              # Packages initialization
│   ├── account_service.py       # Retrieves net liquidation, cash, buying power
│   ├── connection_manager.py    # Connection manager with auto-reconnect backoff
│   ├── contract_service.py      # Qualifies stocks and ETFs (AAPL, TSLA, SPY)
│   ├── historical_data_service.py # Historical OHLCV query (1m, 5m, 15m, Daily)
│   ├── market_data_service.py   # Event-driven real-time bid/ask updates
│   ├── realtime_bar_service.py  # Streams event-driven 5-second real-time bars
│   └── subscription_manager.py  # Tracks active streams and handles reconnection recovery
├── requirements.txt             # Python package dependencies
├── validate_environment.py      # Sequential 10-step diagnostic validation suite
└── README.md                    # Setup documentation, Troubleshooting, and Runbook (This file)
```

### Purpose of Folders:
*   **`config/`**: Holds settings and environment management. By centralizing setup here, other components do not load raw environment variables individually.
*   **`docker/`**: Isolates all container configurations, environment credential templates, and volume data mappings, keeping the root directory clean.
*   **`logs/`**: Dedicated target directory for rotatable and structured runtime logs.
*   **`src/`**: Houses production-ready Python services. Each service is written in accordance with SOLID principles (single responsibility, open-closed, dependency injection).
*   **`src/utils/`**: Shared helper libraries such as loguru routing configurations.

---

## Section 2: Docker Infrastructure

The Docker container runs a headless VNC-enabled IB Gateway coupled with the IBC (Interactive Brokers Controller) wrapper. 

### Configuration Variables
Configure details inside `docker/.env` (see `docker/.env.example` for reference):
*   `TWS_USERID`: Your IB KR paper trading username.
*   `TWS_PASSWORD`: Your IB KR paper trading password.
*   `TRADING_MODE`: Should be set to `paper` for testing.
*   `READ_ONLY_API`: Set to `yes` to prevent accidental trading executions.
*   `VNC_SERVER_PASSWORD`: VNC security password for desktop visualization.
*   `TZ`: Container timezone (e.g. `America/New_York`).

### Persistent Volumes
TWS/Gateway configuration settings are stored inside `/home/ibgateway/Jts` inside the container. To prevent losing configuration details (like trusted API clients and customized settings) when containers restart, we use a named volume:
```yaml
volumes:
  tws_settings:
    driver: local
```

### Restart Policy
Set to `always` to ensure the gateway recovers in case of host reboots or JVM failures.

### Healthcheck
The container includes a TCP socket test checking whether the Gateway API port `4004` (internally) is listening and accepts connections.

---

## Section 3: Python Environment

Ensure Python 3.12 is installed locally on your system.

### Virtual Environment Setup Instructions (Windows PowerShell)

1. Open PowerShell and navigate to the project root:
   ```powershell
   cd c:\Users\tufai\OneDrive\Desktop\trade-analytics-us
   ```

2. Create the virtual environment:
   ```powershell
   python -m venv venv
   ```

3. Activate the virtual environment:
   ```powershell
   .\venv\Scripts\Activate.ps1
   ```

4. Upgrade pip:
   ```powershell
   python -m pip install --upgrade pip
   ```

5. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```

---

## Section 12: Troubleshooting Guide

### 1. Gateway Not Connecting / Login Fails
*   **Symptom**: Docker logs show looping login failures or container health status is unhealthy.
*   **Resolution**: Connect using a VNC Client to `127.0.0.1:5900` (password: `vncpass`). Watch the window. If it prompts you for 2FA, approve it on your phone. If it states incorrect password, double check your credentials in the `.env` file.

### 2. Wrong Port Configuration
*   **Symptom**: Client scripts throw `ConnectionRefusedError` or timeout when trying to connect.
*   **Resolution**: IB Gateway uses different ports based on the trading mode:
    *   **Live Mode**: Default API port is `4001` (container internal `4003`).
    *   **Paper Mode**: Default API port is `4002` (container internal `4004`).
    Make sure your local script is connecting to port `4002` when `TRADING_MODE=paper` is used, and the docker compose maps `127.0.0.1:4002:4004`.

### 3. API Disabled
*   **Symptom**: Gateway is running, but incoming client connections are rejected.
*   **Resolution**: Access the Gateway GUI via VNC. Go to *Configure* -> *API* -> *Settings*. Ensure "Enable ActiveX and Socket Clients" is checked, and verify "Read-Only API" corresponds to your configurations.

### 4. Market Data Permission Issues
*   **Symptom**: Logs show Error Code `354` ("Requested market data is not subscribed").
*   **Resolution**: Interactive Brokers does not provide free live data. You must subscribe to market data subscriptions for specific exchanges (e.g., OPRA, NYSE, NASDAQ) in your account portal.

### 5. bid=None / ask=None
*   **Symptom**: Bid and Ask prices return `None` in the logs.
*   **Resolution**: This happens when:
    *   The market is currently closed (check during standard trading hours).
    *   You lack real-time market data subscriptions (IB returns delayed data, causing ticks to fall back to None).
    *   *Workaround*: If you want delayed data for testing, configure the market data type to delayed by calling `ib.reqMarketDataType(3)` (delayed) or `ib.reqMarketDataType(4)` (delayed-frozen).

### 6. Delayed Data Issues
*   **Symptom**: Logs show Error Code `10197` ("Advisory: Market data connection has been lost/restored").
*   **Resolution**: This occurs if you query market data without active subscriptions. Switch the API market data type to delayed as noted above to receive mock/delayed quotes.

### 7. Docker Networking Issues
*   **Symptom**: Container runs, but ports are inaccessible from local scripts.
*   **Resolution**: Ensure ports are mapped to `127.0.0.1:4002:4004` rather than binding to public interfaces. Confirm no other applications (like local TWS installations) are already using ports `4002` or `5900`.

### 8. Reconnection Issues
*   **Symptom**: Disconnection event triggers, but the client loops trying to connect and fails with "clientId already in use".
*   **Resolution**: Ensure that when a socket breaks, you call `ib.disconnect()` on the client side before calling `connectAsync` again. This cleans up low-level sockets and frees up the Client ID. Our `ConnectionManager` does this automatically.

---

## Section 13: Final Runbook

Follow these commands sequentially to start, verify, and validate the environment:

### Step 1: Start Docker Containers
Navigate to the `docker/` folder, copy the template, set your credentials, and start the container:
```powershell
# Navigate to docker folder
cd docker

# Copy .env template
cp .env.example .env

# Open .env and insert your IB User ID and Password
# Start the Gateway container in the background
docker compose up -d
```

### Step 2: Verify Gateway is Healthy
Monitor startup logs and check container health status:
```powershell
# View logs to verify startup sequence
docker compose logs -f ib-gateway

# Check health check status (should display 'healthy' after ~30 seconds)
docker ps --filter name=ib_gateway
```

### Step 3: Install Python Dependencies
Return to the project root, activate your virtual environment, and install dependencies:
```powershell
# Navigate back to root
cd ..

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

### Step 4: Run Connection and Account Tests
Verify low-level API connection and account summary details:
```powershell
# Run Account Service script directly to check balance details
python -m src.account_service
```

### Step 5: Run Contract Verification Tests
Verify that equity contracts are correctly qualified:
```powershell
# Run Contract Service script to qualify AAPL, NVDA, TSLA, AMD, META, SPY, QQQ
python -m src.contract_service
```

### Step 6: Run Market Data & Real-Time Bar Tests
Verify live streaming feeds:
```powershell
# Test streaming live market quotes (runs for 10 seconds, then exits)
python -m src.market_data_service

# Test streaming real-time 5-second bars (runs for 15 seconds, then exits)
python -m src.realtime_bar_service

# Test historical OHLCV candles (1m, 5m, 15m, Daily)
python -m src.historical_data_service
```

### Step 7: Run Validation Suite
Run the final comprehensive diagnostic suite to print a report of all environment states:
```powershell
# Run the 10-step environment verification suite
python validate_environment.py
```
Expected output:
```text
✓ Connected to IB Gateway
✓ Account Access Verified
✓ Account Summary Retrieved
✓ Contract Qualified
✓ Live Market Data Received
✓ Historical Data Retrieved
✓ Real-Time Bars Received
✓ Environment Ready
```
