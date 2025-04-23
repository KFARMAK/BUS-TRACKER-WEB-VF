// Global variables
let map;
let userSettings = {
    darkMode: true,
    mapStyle: 'standard',
    soundAlerts: true,
    alertThreshold: 3,
    updateInterval: 20,
    showBusPaths: false,
    pathColor: '#90e4fc',
    showStopNames: true,
    showBusIds: true
};
let busMarkers = [];
let stopMarkers = [];
let schoolMarker;
let updateTimer;
let busData = {
    buses: [],
    stops: []
};
// Add these global variables at the top of your main.js
let busPathsVisible = false;
let busPathPolylines = [];
let busPathColor = '#90e4fc'; // Default blue color

// Add these variables at the top of your main.js file with the other global variables
let testBuses = []; // Array to store generated test buses
let trackedBus = null;
let mapStyles = {
    standard: 'https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}&s=Ga',
    satellite: 'https://mt0.google.com/vt/lyrs=s,h&hl=en&x={x}&y={y}&z={z}&s=Ga',
    dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
};

// Global variables for stop management
let activeStopIds = []; // Track which stops are active
const MAX_ACTIVE_STOPS = 5; // Maximum number of stops allowed
let isInitialLoad = true; // Track if this is the first load

// Cache object for data
let cache = {
    stops: [],
    buses: [],
    last_update: 0
};

// Replace your current icon creation functions with these:
const createBusIcon = (busId = null) => {
    const nameLabel = userSettings.showBusIds && busId ? 
        `<div class="bus-label">${busId.substring(0, 3)}</div>` : '';
    
    return L.divIcon({
        className: 'bus-marker',
        html: `
            <div class="bus-marker-container" style="position: relative; width: 100%; height: 100%;">
                <img src="${staticUrl}images/bus-icon.png" alt="Bus" width="48" height="48" 
                     style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;">
                ${nameLabel}
            </div>`,
        iconSize: [60, 60],
        iconAnchor: [30, 30],
        popupAnchor: [0, -30]
    });
};
const createStopIcon = (stopName = null) => {
    const nameLabel = userSettings.showStopNames && stopName ? 
        `<div class="stop-label">${stopName}</div>` : '';
    
    return L.divIcon({
        className: 'stop-marker',
        html: `
            <div class="stop-marker-container" style="position: relative; width: 100%; height: 100%;">
                <img src="${staticUrl}images/stop-icon.png" alt="Stop" width="40" height="40" 
                     style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;">
                ${nameLabel}
            </div>`,
        iconSize: [50, 50],
        iconAnchor: [25, 25],
        popupAnchor: [0, -25]
    });
};
const createSchoolIcon = () => {
    return L.divIcon({
        className: 'school-marker',
        html: `<img src="${staticUrl}images/school-icon.png" alt="School" width="56" height="56">`,
        iconSize: [70, 70],
        iconAnchor: [35, 35],
        popupAnchor: [0, -35]
    });
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, initializing application...');
    
    // Load settings from localStorage
    loadSettings();
    
    // Initialize preloader animation
    initPreloader();
    
    // Initialize map
    initMap();
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize stops tab
    initializeStopsTab();
    
    // Start data updates
    startUpdates();
});

// Function to draw bus paths
function drawBusPaths() {
    // Clear existing paths
    clearBusPaths();
    
    if (!busPathsVisible) return;
    
    // Group buses by stop
    const busesGroupedByStop = {};
    busData.buses.forEach(bus => {
        if (!busesGroupedByStop[bus.stop_id]) {
            busesGroupedByStop[bus.stop_id] = [];
        }
        busesGroupedByStop[bus.stop_id].push(bus);
    });
    
    // For each stop with buses
    Object.keys(busesGroupedByStop).forEach(stopId => {
        // Only draw paths for active stops if any are selected
        if (activeStopIds.length > 0 && !activeStopIds.includes(stopId)) {
            return;
        }
        
        const stop = cache.stops.find(s => s.StopID === stopId);
        if (!stop) return;
        
        const stopLatLng = [parseFloat(stop.StopLat), parseFloat(stop.StopLng)];
        
        busesGroupedByStop[stopId].forEach(bus => {
            if (!bus.lat || !bus.lng) return;
            
            const busLatLng = [bus.lat, bus.lng];
            
            // Create a curved path between bus and stop
            const midpoint = calculateMidpoint(busLatLng, stopLatLng);
            const curvePoint = calculateCurvePoint(busLatLng, stopLatLng, midpoint);
            
            // Create the path
            const pathCoordinates = [busLatLng, curvePoint, stopLatLng];
            
            // Create polyline
            const polyline = L.polyline(pathCoordinates, {
                color: busPathColor,
                weight: 3,
                opacity: 0.7,
                dashArray: '10, 10',
                interactive: false
            }).addTo(map);
            
            // Add animated arrow
            const decorator = L.polylineDecorator(polyline, {
                patterns: [
                    {
                        offset: '100%',
                        repeat: 0,
                        symbol: L.Symbol.arrowHead({
                            pixelSize: 15,
                            polygon: false,
                            pathOptions: {
                                stroke: true,
                                color: busPathColor,
                                weight: 3
                            }
                        })
                    },
                    {
                        offset: 0,
                        repeat: 100,
                        symbol: L.Symbol.dash({
                            pixelSize: 10,
                            pathOptions: {
                                color: busPathColor,
                                weight: 2,
                                opacity: 0.8
                            }
                        })
                    }
                ]
            }).addTo(map);
            
            busPathPolylines.push(polyline);
            busPathPolylines.push(decorator);
            
            // Add distance and time label
            const distance = calculateDistance(busLatLng, stopLatLng);
            const pathMidpoint = [
                (busLatLng[0] + stopLatLng[0]) / 2,
                (busLatLng[1] + stopLatLng[1]) / 2
            ];
            
            const label = L.divIcon({
                className: 'path-label',
                html: `<div style="background: ${busPathColor}; color: white; padding: 3px 6px; border-radius: 3px; font-size: 12px; font-weight: bold;">
                    ${bus.LineID} → ${distance.toFixed(1)}km<br>${bus.time_left} min
                </div>`,
                iconSize: null
            });
            
            const labelMarker = L.marker(pathMidpoint, { icon: label }).addTo(map);
            busPathPolylines.push(labelMarker);
        });
    });
}

// Function to calculate midpoint
function calculateMidpoint(point1, point2) {
    return [
        (point1[0] + point2[0]) / 2,
        (point1[1] + point2[1]) / 2
    ];
}

// Function to calculate curve point
function calculateCurvePoint(point1, point2, midpoint) {
    // Calculate a perpendicular offset for the curve
    const dx = point2[1] - point1[1];
    const dy = point2[0] - point1[0];
    const distance = Math.sqrt(dx * dx + dy * dy);
    const offsetAmount = distance * 0.15; // Adjust curve amount
    
    // Perpendicular offset
    const offsetX = -dy / distance * offsetAmount;
    const offsetY = dx / distance * offsetAmount;
    
    return [
        midpoint[0] + offsetY,
        midpoint[1] + offsetX
    ];
}

// Function to calculate distance between two points
function calculateDistance(point1, point2) {
    const R = 6371; // Earth's radius in km
    const dLat = (point2[0] - point1[0]) * Math.PI / 180;
    const dLon = (point2[1] - point1[1]) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(point1[0] * Math.PI / 180) * Math.cos(point2[0] * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Function to clear all paths
function clearBusPaths() {
    busPathPolylines.forEach(layer => {
        map.removeLayer(layer);
    });
    busPathPolylines = [];
}

// Function to toggle bus paths
function toggleBusPaths() {
    busPathsVisible = !busPathsVisible;
    
    if (busPathsVisible) {
        drawBusPaths();
        document.getElementById('toggle-bus-paths').classList.add('active');
        showNotification('Bus Paths Enabled', 'Bus paths are now visible on the map', 'info');
    } else {
        clearBusPaths();
        document.getElementById('toggle-bus-paths').classList.remove('active');
        showNotification('Bus Paths Disabled', 'Bus paths have been hidden', 'info');
    }
    
    // Update user settings
    userSettings.showBusPaths = busPathsVisible;
    saveSettings();
}

// Function to generate a random test bus
function generateTestBus() {
    // Generate random ID and name
    const busId = 'TEST' + Math.floor(Math.random() * 1000);
    const busName = `Test Bus ${busId}`;
    
    // Select a random stop from existing stops
    const randomStop = cache.stops[Math.floor(Math.random() * cache.stops.length)];
    
    // Generate random position near the stop
    const latOffset = (Math.random() - 0.5) * 0.01; // Random offset within ~1km
    const lngOffset = (Math.random() - 0.5) * 0.01;
    
    // Create test bus object
    const testBus = {
        LineID: busId,
        LineDescr: busName,
        RouteCode: 'TEST_ROUTE',
        route_code: 'TEST_ROUTE',
        stop_id: randomStop ? randomStop.StopID : '999999',
        stop_name: randomStop ? randomStop.StopDescr : 'Test Stop',
        time_left: String(Math.floor(Math.random() * 20) + 1), // Random time 1-20 minutes
        lat: (randomStop ? parseFloat(randomStop.StopLat) : defaultLocation.lat) + latOffset,
        lng: (randomStop ? parseFloat(randomStop.StopLng) : defaultLocation.lng) + lngOffset,
        vehicle_id: 'TEST_VEH_' + Math.floor(Math.random() * 1000),
        isTest: true // Flag to identify test buses
    };
    
    // Add to test buses array
    testBuses.push(testBus);
    
    // Update the display
    refreshWithTestBuses();
    
    // Show notification
    showNotification(
        'Test Bus Generated', 
        `Test bus ${busId} has been added to the map`, 
        'success'
    );
}

// TEEEEST BUUUUUS
function refreshWithTestBuses() {
    // Combine real buses with test buses
    const combinedBuses = [...cache.buses, ...testBuses];
    
    // Update data with combined buses
    busData.buses = combinedBuses;
    
    // Clear and redraw everything
    clearMarkers();
    
    // If we have active stops, filter accordingly
    if (activeStopIds.length > 0) {
        const filteredStops = cache.stops.filter(stop => 
            activeStopIds.includes(stop.StopID)
        );
        
        filteredStops.forEach(stop => {
            addStopMarker(stop);
        });
        
        const filteredBuses = combinedBuses.filter(bus => 
            activeStopIds.includes(bus.stop_id)
        );
        
        updateBuses(filteredBuses, filteredStops);
        updateNearestBus(filteredBuses);
    } else {
        // Show all stops and buses
        cache.stops.forEach(stop => {
            addStopMarker(stop);
        });
        
        updateBuses(combinedBuses, cache.stops);
        updateNearestBus(combinedBuses);
    }
}

// Function to clear all test buses
function clearTestBuses() {
    // Remove only test buses
    testBuses = [];
    
    // Refresh display with only real buses
    busData.buses = cache.buses;
    
    // Update the display
    updateData();
    
    // Show notification
    showNotification(
        'Test Buses Cleared', 
        'All test buses have been removed from the map', 
        'info'
    );
}

function setupTestButtonListeners() {
    // Generate test bus button
    const generateButton = document.getElementById('generate-test-bus');
    if (generateButton) {
        generateButton.addEventListener('click', generateTestBus);
    }
    
    // Clear test buses button
    const clearButton = document.getElementById('clear-test-buses');
    if (clearButton) {
        clearButton.addEventListener('click', clearTestBuses);
    }
}

// Initialize preloader with a safety timeout
function initPreloader() {
    console.log('Initializing preloader...');
    const preloader = document.getElementById('preloader');
    const progress = document.querySelector('.loading-progress');
    
    // Simulate loading progress
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 100) {
            clearInterval(interval);
            
            // Fade out preloader
            setTimeout(() => {
                preloader.style.opacity = '0';
                setTimeout(() => {
                    preloader.style.display = 'none';
                    console.log('Preloader removed successfully');
                    
                    // Show welcome notification
                    showNotification('Welcome', 'Bus Searcher is now tracking buses in your area', 'info');
                }, 500);
            }, 500);
        } else {
            width += 5;
            progress.style.width = width + '%';
        }
    }, 100);
    
    // Safety timeout - ensure preloader is removed after 10 seconds even if something goes wrong
    setTimeout(() => {
        if (preloader.style.display !== 'none') {
            clearInterval(interval);
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.display = 'none';
                console.log('Preloader forcibly removed by safety timeout');
                
                // Show notification about potential issues
                showNotification('Loading Complete', 'Bus Searcher loaded with some delays', 'info');
            }, 500);
        }
    }, 10000);
}

// Initialize map
function initMap() {
    console.log('Initializing map...');
    try {
        // Create map instance
        map = L.map('map', {
            zoomControl: false,
            attributionControl: true,
            minZoom: 12,
            maxZoom: 18
        }).setView([defaultLocation.lat, defaultLocation.lng], 16);
        
        // Add tile layer based on settings
        L.tileLayer(mapStyles[userSettings.mapStyle], {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // Add school marker with custom icon
        schoolMarker = L.marker([defaultLocation.lat, defaultLocation.lng], { icon: createSchoolIcon() })
            .addTo(map)
            .bindPopup(`<b>${defaultLocation.name}</b>`)
            .openPopup();
        
        // Apply dark mode if enabled
        applyTheme();
        
        console.log('Map initialized successfully');
    } catch (error) {
        console.error('Error initializing map:', error);
        showNotification('Map Error', 'There was a problem initializing the map. Please refresh the page.', 'error');
    }
}

// Set up event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            
            // Update active tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`${tabName}-content`).classList.add('active');
            
            // Refresh stops tab if selected
            if (tabName === 'stops') {
                updateStopsTab();
            }
        });
    });
    
    // Add these event listeners to your setupEventListeners function
    document.getElementById('toggle-bus-paths').addEventListener('click', toggleBusPaths);
    
    document.getElementById('path-toggle').addEventListener('change', (e) => {
        busPathsVisible = e.target.checked;
        userSettings.showBusPaths = busPathsVisible;
        saveSettings();
        
        if (busPathsVisible) {
            drawBusPaths();
        } else {
            clearBusPaths();
        }
    });
    
    document.getElementById('path-color').addEventListener('change', (e) => {
        busPathColor = e.target.value;
        userSettings.pathColor = busPathColor;
        saveSettings();
        
        if (busPathsVisible) {
            drawBusPaths();
        }
    });
    
    // Map control buttons
    document.getElementById('center-map').addEventListener('click', () => {
        map.setView([defaultLocation.lat, defaultLocation.lng], 16);
        pulseMarker(schoolMarker);
    });
    
    document.getElementById('zoom-in').addEventListener('click', () => {
        map.zoomIn();
    });
    
    document.getElementById('zoom-out').addEventListener('click', () => {
        map.zoomOut();
    });
    
    document.getElementById('toggle-fullscreen').addEventListener('click', () => {
        toggleFullscreen();
    });
    
    // Close quick info panel
    document.querySelector('.close-quick-info').addEventListener('click', () => {
        document.getElementById('quick-info').classList.remove('show');
    });
    
    // Settings controls
    document.getElementById('dark-mode-toggle').addEventListener('change', (e) => {
        userSettings.darkMode = e.target.checked;
        saveSettings();
        applyTheme();
    });
    
    document.getElementById('map-style').addEventListener('change', (e) => {
        userSettings.mapStyle = e.target.value;
        saveSettings();
        updateMapStyle();
    });
    
    document.getElementById('sound-toggle').addEventListener('change', (e) => {
        userSettings.soundAlerts = e.target.checked;
        saveSettings();
    });
    
    document.getElementById('alert-threshold').addEventListener('change', (e) => {
        userSettings.alertThreshold = parseInt(e.target.value);
        saveSettings();
    });
    
    document.getElementById('update-interval').addEventListener('change', (e) => {
        userSettings.updateInterval = parseInt(e.target.value);
        saveSettings();
        restartUpdates();
    });
    
    document.getElementById('test-sound').addEventListener('click', () => {
        playSound('notification-sound');
        showNotification('Test Sound', 'This is how notifications will sound', 'info');
    });
    
    // Search functionality
    document.getElementById('bus-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterBusCards(searchTerm);
    });
    
    // Load saved active stops
    loadActiveStops();
    
    // Stop search functionality
    const stopSearch = document.getElementById('stop-search');
    if (stopSearch) {
        stopSearch.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filterStopItems(searchTerm);
        });
    }
    
    // Add this at the end of your setupEventListeners function:
    setupTestButtonListeners();
    console.log('Event listeners set up successfully');
}

// Initialize stops tab
function initializeStopsTab() {
    // Initial population of stops tab
    updateStopsTab();
}

// Start updating data from server
function startUpdates() {
    console.log('Starting data updates...');
    
    // Initial update
    updateData();
    
    // Set interval for updates
    updateTimer = setInterval(updateData, userSettings.updateInterval * 1000);
}

// Restart update timer
function restartUpdates() {
    clearInterval(updateTimer);
    updateTimer = setInterval(updateData, userSettings.updateInterval * 1000);
    
    showNotification('Settings Updated', `Data will now refresh every ${userSettings.updateInterval} seconds`, 'info');
}

// Update the updateData function to respect active stops and show prompt on first load
async function updateData() {
    try {
        // Update status indicator
        document.getElementById('status-indicator').className = 'status-indicator online';
        document.getElementById('connection-status').textContent = 'Connected';
        
        // Fetch stops data
        const stopsResponse = await fetch('/api/stops');
        const stops = await stopsResponse.json();
        
        // Fetch buses data
        const busesResponse = await fetch('/api/buses');
        const data = await busesResponse.json();
        const buses = data.buses;
        
        // Update data cache
        busData.buses = buses;
        busData.stops = stops;
        cache.buses = buses;
        cache.stops = stops;
        
        // Update last update time
        const lastUpdateTime = new Date(data.last_update * 1000).toLocaleTimeString();
        document.getElementById('last-update').textContent = lastUpdateTime;
        
        // On first load, prompt user to select stops
        if (isInitialLoad && activeStopIds.length === 0) {
            isInitialLoad = false;
            showStopSelectionPrompt();
            return;
        }
        
        // Clear existing markers and cards
        clearMarkers();
        
        // Filter stops based on active selection
        let stopsToDisplay;
        let busesToDisplay;
        
        if (activeStopIds.length > 0) {
            // Only show active stops
            stopsToDisplay = stops.filter(stop => activeStopIds.includes(stop.StopID));
            busesToDisplay = buses.filter(bus => activeStopIds.includes(bus.stop_id));
        } else {
            // If no stops selected, don't show anything
            const busesContainer = document.querySelector('.bus-cards-container');
            busesContainer.innerHTML = `
                <div class="no-stops-selected">
                    <span class="material-icons">bus_alert</span>
                    <h3>No Bus Stops Selected</h3>
                    <p>Select up to ${MAX_ACTIVE_STOPS} bus stops to start tracking buses.</p>
                    <button class="btn-primary select-stops-btn">Select Stops</button>
                </div>
            `;
            
            // Add click handler to button
            const selectStopsBtn = busesContainer.querySelector('.select-stops-btn');
            selectStopsBtn.addEventListener('click', () => {
                document.querySelector('.tab[data-tab="stops"]').click();
            });
            
            return;
        }
        
        // Add stop markers only for stops to display
        stopsToDisplay.forEach(stop => {
            addStopMarker(stop);
        });
        
        // Add buses to map and sidebar
        updateBuses(busesToDisplay, stopsToDisplay);
        
        // Update nearest bus info
        updateNearestBus(busesToDisplay);
        
        // Check for buses arriving soon
        checkBusArrivals(busesToDisplay);
        
    } catch (error) {
        console.error('Error updating data:', error);
        document.getElementById('status-indicator').className = 'status-indicator offline';
        document.getElementById('connection-status').textContent = 'Disconnected';
        
        // Play error sound
        playSound('error-sound');
        
        // Show error notification
        showNotification('Connection Error', 'Unable to connect to the server. Retrying...', 'error');
    }
    
    if (busPathsVisible) {
        drawBusPaths();
    }
}

// Function to show stop selection prompt
function showStopSelectionPrompt() {
    // Switch to stops tab
    document.querySelector('.tab[data-tab="stops"]').click();
    
    // Show welcome notification
    showNotification(
        'Welcome to Bus Tracker',
        `Please select up to ${MAX_ACTIVE_STOPS} bus stops to start tracking buses in your area.`,
        'info'
    );
    
    // Highlight the stops tab
    const stopsTab = document.querySelector('.tab[data-tab="stops"]');
    stopsTab.style.animation = 'pulse 2s infinite';
    
    // Remove animation after a few seconds
    setTimeout(() => {
        stopsTab.style.animation = '';
    }, 5000);
}

// Clear all markers and bus cards
function clearMarkers() {
    // Clear bus markers
    busMarkers.forEach(marker => marker.remove());
    busMarkers = [];
    
    // Clear stop markers
    stopMarkers.forEach(marker => marker.remove());
    stopMarkers = [];
    
    // Clear bus cards
    const busesContent = document.querySelector('.bus-cards-container');
    busesContent.innerHTML = '';
}

function addStopMarker(stop) {
    const marker = L.marker([parseFloat(stop.StopLat), parseFloat(stop.StopLng)], { 
        icon: createStopIcon(stop.StopDescr),
        riseOnHover: true,
        riseOffset: 250, // Add this to control the z-index when hovering
        zIndexOffset: 100 // Add this to set the base z-index
    }).addTo(map);
    
    // Create popup content
    const popupContent = document.getElementById('stop-popup-template').content.cloneNode(true);
    popupContent.querySelector('.stop-name').textContent = stop.StopDescr;
    popupContent.querySelector('.stop-id').textContent = `(${stop.StopID})`;
    
    // Find buses for this stop
    const incomingBuses = busData.buses.filter(bus => bus.stop_id === stop.StopID);
    const incomingBusesContainer = popupContent.querySelector('.incoming-buses');
    const noBusesMsg = popupContent.querySelector('.no-buses');
    
    if (incomingBuses.length > 0) {
        noBusesMsg.classList.add('hidden');
        
        incomingBuses.forEach(bus => {
            const busItem = document.createElement('div');
            busItem.className = 'incoming-bus';
            busItem.innerHTML = `
                <span class="incoming-bus-id">${bus.LineID}</span>
                <span class="incoming-bus-time">${bus.time_left}'</span>
            `;
            incomingBusesContainer.appendChild(busItem);
        });
    } else {
        noBusesMsg.classList.remove('hidden');
    }
    
    const popupContainer = document.createElement('div');
    popupContainer.appendChild(popupContent);
    
    marker.bindPopup(popupContainer, {
        offset: [0, -5],
        closeButton: false,
        autoPan: false,
        className: 'stop-popup',
        closeOnClick: false, // Add this
        autoClose: false // Add this
    });
    
    let isPopupOpen = false;
    let hoverTimeout;
// For both addStopMarker and addBusMarker, replace the event handlers with:
marker.on('mouseover', function(e) {
    L.DomEvent.stopPropagation(e);
    this.openPopup();
});

marker.on('mouseout', function(e) {
    L.DomEvent.stopPropagation(e);
    setTimeout(() => {
        this.closePopup();
    }, 100);
});

marker.on('click', function(e) {
    L.DomEvent.stopPropagation(e);
        if (!isPopupOpen) {
            this.openPopup();
            isPopupOpen = true;
        }
        L.DomEvent.stopPropagation(e); // Prevent event bubbling
    });
    
    stopMarkers.push(marker);
}

// Update buses information - SHOW EACH BUS ONLY ONCE
function updateBuses(buses, stops) {
    const busesContainer = document.querySelector('.bus-cards-container');
    
    // Clear loading indicator
    busesContainer.innerHTML = '';
    
    // Create a map to hold unique buses by ID
    const uniqueBusesMap = new Map();
    
    // Process all buses but keep only the earliest arriving instance of each bus line
    buses.forEach(bus => {
        const busKey = bus.LineID; // Use LineID as the unique identifier
        
        // If this bus ID hasn't been seen yet, or this instance is arriving sooner
        if (!uniqueBusesMap.has(busKey) || 
            parseInt(bus.time_left) < parseInt(uniqueBusesMap.get(busKey).time_left)) {
            uniqueBusesMap.set(busKey, bus);
        }
    });
    
    // Convert the map of unique buses back to an array
    const uniqueBuses = Array.from(uniqueBusesMap.values());
    
    // Group unique buses by stop
    const busesByStop = {};
    
    uniqueBuses.forEach(bus => {
        if (!busesByStop[bus.stop_id]) {
            busesByStop[bus.stop_id] = {
                stop: stops.find(s => s.StopID === bus.stop_id),
                buses: []
            };
        }
        
        busesByStop[bus.stop_id].buses.push(bus);
        
        // Add bus marker to map
        addBusMarker(bus);
    });
    
    // Create bus cards for each stop
    Object.values(busesByStop).forEach(stopData => {
        // Sort buses by arrival time
        stopData.buses.sort((a, b) => parseInt(a.time_left) - parseInt(b.time_left));
        
        stopData.buses.forEach(bus => {
            const busCard = createBusCard(bus, stopData.stop);
            busesContainer.appendChild(busCard);
        });
    });
    
    // Show message if no buses found
    if (uniqueBuses.length === 0) {
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'loading-container';
        noDataMsg.innerHTML = `
            <div class="no-data">No buses currently available</div>
        `;
        busesContainer.appendChild(noDataMsg);
    }
    
    // After adding all bus cards, animate them in sequence
    animateBusCards();
    
    // Log the number of buses displayed
    console.log(`Showing ${uniqueBuses.length} unique buses from ${buses.length} total buses`);
}

// Animate bus cards on entry
function animateBusCards() {
    const cards = document.querySelectorAll('.bus-card');
    
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.style.animation = 'fadeIn 0.5s ease-out forwards';
        }, index * 100);
    });
}

// Update the addBusMarker function
function addBusMarker(bus) {
    if (!bus.lat || !bus.lng) return;
    
    const marker = L.marker([bus.lat, bus.lng], { 
        icon: createBusIcon(bus.LineID),
        riseOnHover: true,
        riseOffset: 250, // Add this to control the z-index when hovering
        zIndexOffset: 200 // Add this to set the base z-index higher than stops
    }).addTo(map);
    
    // Create popup content
    const popupContent = document.getElementById('bus-popup-template').content.cloneNode(true);
    popupContent.querySelector('.bus-id').textContent = bus.LineID;
    popupContent.querySelector('.bus-name').textContent = bus.LineDescr;
    popupContent.querySelector('.stop-name').textContent = bus.stop_name;
    popupContent.querySelector('.arrival-time').textContent = `${bus.time_left} min`;
    
    // Add functionality to the navigate button
    const navigateBtn = popupContent.querySelector('.popup-btn');
    navigateBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent event bubbling
        const url = `https://www.google.com/maps/dir/?api=1&destination=${bus.lat},${bus.lng}`;
        window.open(url, '_blank');
    });
    
    const popupContainer = document.createElement('div');
    popupContainer.appendChild(popupContent);
    
    marker.bindPopup(popupContainer, {
        offset: [0, -5],
        closeButton: false,
        autoPan: false,
        className: 'bus-popup',
        closeOnClick: false, // Add this
        autoClose: false // Add this
    });
    
    // Store bus data with marker
    marker.busData = bus;
    
    let isPopupOpen = false;
    let hoverTimeout;
    
    marker.on('mouseover', function(e) {
        clearTimeout(hoverTimeout);
        if (!isPopupOpen) {
            this.openPopup();
            isPopupOpen = true;
        }
    });
    
    marker.on('mouseout', function(e) {
        hoverTimeout = setTimeout(() => {
            if (isPopupOpen) {
                this.closePopup();
                isPopupOpen = false;
            }
        }, 200); // Increased delay to prevent flickering
    });
    
    marker.on('click', function(e) {
        clearTimeout(hoverTimeout);
        if (!isPopupOpen) {
            this.openPopup();
            isPopupOpen = true;
        }
        trackBus(bus);
        L.DomEvent.stopPropagation(e); // Prevent event bubbling
    });
    
    busMarkers.push(marker);
    
    // If this is the tracked bus, highlight it and center map
    if (trackedBus && bus.LineID === trackedBus.LineID && bus.route_code === trackedBus.route_code) {
        marker._icon.classList.add('tracked');
        map.setView([bus.lat, bus.lng], 16);
        
        // Update tracked bus data
        trackedBus = bus;
    }
}
// Create a bus information card
function createBusCard(bus, stop) {
    const template = document.getElementById('bus-card-template');
    const busCard = template.content.cloneNode(true);
    
    busCard.querySelector('.stop-name').textContent = bus.stop_name;
    busCard.querySelector('.stop-id').textContent = `(${bus.stop_id})`;
    busCard.querySelector('.bus-id').textContent = bus.LineID;
    busCard.querySelector('.bus-name').textContent = bus.LineDescr;
    
    const timeElement = busCard.querySelector('.bus-time');
    timeElement.textContent = `${bus.time_left}'`;
    
    // Highlight buses arriving very soon
    if (parseInt(bus.time_left) <= userSettings.alertThreshold) {
        timeElement.classList.add('soon');
    }
    
    // Set progress bar width based on arrival time
    const maxTime = 20; // Assume 20 minutes is the max time
    const timePercent = Math.max(0, 100 - (parseInt(bus.time_left) / maxTime * 100));
    busCard.querySelector('.progress').style.width = `${timePercent}%`;
    
    // Add event listener to track bus button
    const trackBtn = busCard.querySelector('.track-bus-btn');
    trackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        trackBus(bus);
    });
    
    // Add event listener to favorite button
    const favoriteBtn = busCard.querySelector('.favorite-btn');
    favoriteBtn.addEventListener('click', () => {
        favoriteBtn.classList.toggle('active');
        const icon = favoriteBtn.querySelector('.material-icons');
        
        if (favoriteBtn.classList.contains('active')) {
            icon.textContent = 'star';
            showNotification('Favorite Added', `Bus ${bus.LineID} has been added to favorites`, 'success');
        } else {
            icon.textContent = 'star_border';
        }
    });
    
    // Create the final card element
    const cardElement = document.createElement('div');
    cardElement.appendChild(busCard);
    
    // Add data attributes for filtering
    cardElement.querySelector('.bus-card').setAttribute('data-bus-id', bus.LineID);
    cardElement.querySelector('.bus-card').setAttribute('data-stop-name', bus.stop_name.toLowerCase());
    
    return cardElement.firstElementChild;
}

// Update nearest bus information
function updateNearestBus(buses) {
    const quickInfo = document.getElementById('quick-info');
    const nearestBusContainer = document.getElementById('nearest-bus');
    
    // Find nearest bus (lowest arrival time)
    if (buses.length > 0) {
        // Sort buses by arrival time
        const sortedBuses = [...buses].sort((a, b) => parseInt(a.time_left) - parseInt(b.time_left));
        const nearestBus = sortedBuses[0];
        
        // Create nearest bus card
        nearestBusContainer.innerHTML = `
            <div class="nearest-bus-info">
                <div class="bus-id">${nearestBus.LineID}</div>
                <div class="bus-name">${nearestBus.LineDescr}</div>
                <div class="info-row">
                    <span class="material-icons">location_on</span>
                    <span>${nearestBus.stop_name}</span>
                </div>
                <div class="info-row">
                    <span class="material-icons">schedule</span>
                    <span>Arriving in ${nearestBus.time_left} minutes</span>
                </div>
            </div>
            <button class="track-btn btn-primary">
                <span class="material-icons">gps_fixed</span>
                Track
            </button>
        `;
        
        // Add event listener to track button
        nearestBusContainer.querySelector('.track-btn').addEventListener('click', () => {
            trackBus(nearestBus);
        });
        
        // Show quick info panel
        quickInfo.classList.add('show');
    } else {
        nearestBusContainer.innerHTML = `<div class="no-data">No buses nearby</div>`;
        quickInfo.classList.remove('show');
    }
}

// Check for buses arriving soon and show notifications
function checkBusArrivals(buses) {
    buses.forEach(bus => {
        const arrivalTime = parseInt(bus.time_left);
        
        // Check if bus is arriving within threshold
        if (arrivalTime <= userSettings.alertThreshold) {
            // Check if we need to play sound
            if (arrivalTime === 1) {
                playSound('bus-arriving-sound');
                
                showNotification(
                    'Bus Arriving!',
                    `Bus ${bus.LineID} (${bus.LineDescr}) is arriving at ${bus.stop_name} in 1 minute!`,
                    'warning'
                );
            } else if (arrivalTime === userSettings.alertThreshold) {
                playSound('notification-sound');
                
                showNotification(
                    'Bus Approaching',
                    `Bus ${bus.LineID} (${bus.LineDescr}) will arrive at ${bus.stop_name} in ${arrivalTime} minutes`,
                    'info'
                );
            }
        }
    });
}

// Play sound effect if enabled
function playSound(soundId) {
    try {
        if (userSettings.soundAlerts) {
            const sound = document.getElementById(soundId);
            if (sound) {
                sound.currentTime = 0;
                sound.play().catch(err => {
                    console.error(`Error playing sound ${soundId}:`, err);
                });
            } else {
                console.error(`Sound element not found: ${soundId}`);
            }
        }
    } catch (error) {
        console.error('Error playing sound:', error);
    }
}

// Track a specific bus
function trackBus(bus) {
    // Update tracked bus
    trackedBus = bus;
    
    // Center map on bus
    map.setView([bus.lat, bus.lng], 16);
    
    // Find marker for this bus and highlight it
    busMarkers.forEach(marker => {
        if (marker.busData && marker.busData.LineID === bus.LineID && marker.busData.route_code === bus.route_code) {
            // Add highlight class
            marker._icon.classList.add('tracked');
            
            // Pulse effect
            pulseMarker(marker);
        } else {
            // Remove highlight from other markers
            marker._icon.classList.remove('tracked');
        }
    });
    
    // Show notification
    showNotification(
        'Tracking Bus',
        `Now tracking Bus ${bus.LineID} (${bus.LineDescr})`,
        'success'
    );
}

// Apply pulse animation to marker
function pulseMarker(marker) {
    try {
        // Use GSAP for animation
        gsap.to(marker._icon, {
            scale: 1.3,
            duration: 0.3,
            ease: "power2.out",
            onComplete: () => {
                gsap.to(marker._icon, {
                    scale: 1,
                    duration: 0.5,
                    ease: "elastic.out(1, 0.3)"
                });
            }
        });
    } catch (error) {
        console.error('Error applying pulse animation:', error);
    }
}

// Filter bus cards based on search term
function filterBusCards(searchTerm) {
    const busCards = document.querySelectorAll('.bus-card');
    
    busCards.forEach(card => {
        const busId = card.getAttribute('data-bus-id').toLowerCase();
        const stopName = card.getAttribute('data-stop-name').toLowerCase();
        
        if (busId.includes(searchTerm) || stopName.includes(searchTerm)) {
            card.style.display = 'block';
            
            // Highlight the matching text
            if (searchTerm.length > 0) {
                // Reset previous highlights
                card.innerHTML = card.innerHTML.replace(/<mark>/g, '').replace(/<\/mark>/g, '');
                
                // Add new highlights
                highlightText(card.querySelector('.bus-id'), searchTerm);
                highlightText(card.querySelector('.stop-name'), searchTerm);
            }
        } else {
            card.style.display = 'none';
        }
    });
}

// Highlight matching text in element
function highlightText(element, searchTerm) {
    if (!element) return;
    
    const text = element.textContent;
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(searchTerm);
    
    if (index >= 0) {
        const before = text.substring(0, index);
        const match = text.substring(index, index + searchTerm.length);
        const after = text.substring(index + searchTerm.length);
        
        element.innerHTML = before + '<mark>' + match + '</mark>' + after;
    }
}

// Show notification - fixed version with swipe to dismiss
function showNotification(title, message, type = 'info') {
    try {
        const notificationCenter = document.getElementById('notification-center');
        if (!notificationCenter) {
            console.error('Notification center element not found');
            return;
        }
        
        // Create notification element directly instead of using template
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification ${type}`;
        
        // Build notification content directly
        notificationElement.innerHTML = `
            <div class="notification-icon">
                <span class="material-icons">${
                    type === 'success' ? 'check_circle' :
                    type === 'warning' ? 'warning' :
                    type === 'error' ? 'error' : 'info'
                }</span>
            </div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <div class="notification-close">
                <span class="material-icons">close</span>
            </div>
        `;
        
        // Add to notification center
        notificationCenter.appendChild(notificationElement);
        
        // Show notification with animation
        setTimeout(() => {
            notificationElement.classList.add('show');
        }, 10);
        
        // Add close button functionality
        const closeBtn = notificationElement.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notificationElement.classList.remove('show');
            
            setTimeout(() => {
                notificationElement.remove();
            }, 300);
        });
        
        // Add swipe to dismiss functionality
        let touchStartX = 0;
        let touchEndX = 0;
        let isDragging = false;
        let currentTranslateX = 0;
        
        notificationElement.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            isDragging = true;
            notificationElement.style.transition = 'none';
        });
        
        notificationElement.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            touchEndX = e.touches[0].clientX;
            const deltaX = touchEndX - touchStartX;
            
            if (deltaX > 0) { // Only allow swiping to the right
                currentTranslateX = deltaX;
                notificationElement.style.transform = `translateX(${deltaX}px)`;
                notificationElement.style.opacity = 1 - (deltaX / 200);
            }
        });
        
        notificationElement.addEventListener('touchend', () => {
            isDragging = false;
            notificationElement.style.transition = '';
            
            // If swiped more than 100px, dismiss the notification
            if (currentTranslateX > 100) {
                notificationElement.style.transform = 'translateX(100%)';
                notificationElement.style.opacity = '0';
                
                setTimeout(() => {
                    notificationElement.remove();
                }, 300);
            } else {
                // Reset position
                notificationElement.style.transform = '';
                notificationElement.style.opacity = '';
            }
            
            currentTranslateX = 0;
        });
        
        // Add mouse drag support for desktop
        notificationElement.addEventListener('mousedown', (e) => {
            touchStartX = e.clientX;
            isDragging = true;
            notificationElement.style.transition = 'none';
            notificationElement.style.cursor = 'grabbing';
            
            const handleMouseMove = (event) => {
                if (!isDragging) return;
                
                touchEndX = event.clientX;
                const deltaX = touchEndX - touchStartX;
                
                if (deltaX > 0) { // Only allow swiping to the right
                    currentTranslateX = deltaX;
                    notificationElement.style.transform = `translateX(${deltaX}px)`;
                    notificationElement.style.opacity = 1 - (deltaX / 200);
                }
            };
            
            const handleMouseUp = () => {
                isDragging = false;
                notificationElement.style.transition = '';
                notificationElement.style.cursor = '';
                
                // If swiped more than 100px, dismiss the notification
                if (currentTranslateX > 100) {
                    notificationElement.style.transform = 'translateX(100%)';
                    notificationElement.style.opacity = '0';
                    
                    setTimeout(() => {
                        notificationElement.remove();
                    }, 300);
                } else {
                    // Reset position
                    notificationElement.style.transform = '';
                    notificationElement.style.opacity = '';
                }
                
                currentTranslateX = 0;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            if (notificationElement.parentNode) {
                notificationElement.classList.remove('show');
                
                setTimeout(() => {
                    if (notificationElement.parentNode) {
                        notificationElement.remove();
                    }
                }, 300);
            }
        }, 5000);
        
        console.log(`Showing ${type} notification: ${title} - ${message}`);
    } catch (error) {
        console.error('Error showing notification:', error);
    }
}

// Toggle fullscreen mode
function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
                .then(() => {
                    document.getElementById('toggle-fullscreen').querySelector('.material-icons').textContent = 'fullscreen_exit';
                })
                .catch(err => {
                    showNotification('Fullscreen Error', 'Unable to enter fullscreen mode', 'error');
                });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen()
                    .then(() => {
                        document.getElementById('toggle-fullscreen').querySelector('.material-icons').textContent = 'fullscreen';
                    })
                    .catch(err => {
                        showNotification('Fullscreen Error', 'Unable to exit fullscreen mode', 'error');
                    });
            }
        }
    } catch (error) {
        console.error('Error toggling fullscreen:', error);
    }
}

// Update map style when changed in settings
function updateMapStyle() {
    try {
        // Remove current tile layer
        map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });
        
        // Add new tile layer
        L.tileLayer(mapStyles[userSettings.mapStyle], {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        
        // Show notification
        showNotification('Map Style Updated', `Map style changed to ${userSettings.mapStyle}`, 'info');
    } catch (error) {
        console.error('Error updating map style:', error);
        showNotification('Map Style Error', 'Failed to update map style', 'error');
    }
}

// Apply theme based on settings
function applyTheme() {
    if (userSettings.darkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }
}

// Save settings to localStorage
function saveSettings() {
    try {
        localStorage.setItem('busAppSettings', JSON.stringify(userSettings));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

function loadSettings() {
    try {
        const savedSettings = localStorage.getItem('busAppSettings');
        
        if (savedSettings) {
            userSettings = { ...userSettings, ...JSON.parse(savedSettings) };
            
            // Apply loaded settings to UI
            document.getElementById('dark-mode-toggle').checked = userSettings.darkMode;
            document.getElementById('map-style').value = userSettings.mapStyle;
            document.getElementById('sound-toggle').checked = userSettings.soundAlerts;
            document.getElementById('alert-threshold').value = userSettings.alertThreshold;
            document.getElementById('update-interval').value = userSettings.updateInterval;
            document.getElementById('path-toggle').checked = userSettings.showBusPaths;
            document.getElementById('path-color').value = userSettings.pathColor;
            
            busPathsVisible = userSettings.showBusPaths;
            busPathColor = userSettings.pathColor;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// ======== STOPS TAB FUNCTIONALITY ========

// Function to update the stops tab with current data
function updateStopsTab() {
    const stopsContainer = document.querySelector('.stops-container');
    if (!stopsContainer) return;
    
    // Clear container
    stopsContainer.innerHTML = '';
    
    // Create info bar
    const filterInfo = document.createElement('div');
    filterInfo.className = 'stop-filter-info';
    filterInfo.innerHTML = `
        <div>
            <span class="count">${activeStopIds.length}</span> of <span>${MAX_ACTIVE_STOPS}</span> stops active
        </div>
        <button class="reset-stops">Reset All</button>
    `;
    stopsContainer.appendChild(filterInfo);
    
    // Add reset functionality
    const resetButton = filterInfo.querySelector('.reset-stops');
    resetButton.addEventListener('click', resetAllStops);
    
    // Get current stops data
    const stops = cache.stops || [];
    
    if (stops.length === 0) {
        const noStopsMsg = document.createElement('div');
        noStopsMsg.className = 'no-stops-message';
        noStopsMsg.textContent = 'No bus stops available in this area';
        stopsContainer.appendChild(noStopsMsg);
        return;
    }
    
    // Sort stops by proximity (if distance is available) or alphabetically
    const sortedStops = [...stops].sort((a, b) => {
        if (a.distance && b.distance) {
            return parseFloat(a.distance) - parseFloat(b.distance);
        }
        return a.StopDescr.localeCompare(b.StopDescr);
    });
    
    // Create stop toggle items
    sortedStops.forEach(stop => {
        const stopItem = createStopItem(stop);
        stopsContainer.appendChild(stopItem);
    });
}

// Function to create a stop item with toggle
function createStopItem(stop) {
    const template = document.getElementById('stop-item-template');
    if (!template) {
        console.error('Stop item template not found');
        return document.createElement('div');
    }
    
    const stopItem = template.content.cloneNode(true);
    const container = document.createElement('div');
    container.appendChild(stopItem);
    
    const item = container.querySelector('.stop-item');
    item.setAttribute('data-stop-id', stop.StopID);
    
    // Set stop info
    item.querySelector('.stop-name').textContent = stop.StopDescr;
    item.querySelector('.stop-id').textContent = `(${stop.StopID})`;
    
    // Set toggle state based on active stops
    const toggle = item.querySelector('.stop-toggle');
    const isActive = activeStopIds.includes(stop.StopID);
    toggle.checked = isActive;
    
    if (isActive) {
        item.classList.add('active');
    }
    
    // Check if we've reached the maximum and this stop is not active
    if (activeStopIds.length >= MAX_ACTIVE_STOPS && !isActive) {
        item.classList.add('disabled');
        toggle.disabled = true;
    }
    
    // Add event listener for toggle
    toggle.addEventListener('change', () => {
        toggleStop(stop.StopID, toggle.checked, item);
    });
    
    return item;
}

// Function to handle toggling a stop on/off
function toggleStop(stopId, isActive, itemElement) {
    if (isActive) {
        // Check if we've reached the maximum
        if (activeStopIds.length >= MAX_ACTIVE_STOPS) {
            // Revert the toggle
            const toggle = itemElement.querySelector('.stop-toggle');
            toggle.checked = false;
            
            // Show notification
            showNotification(
                'Stop Limit Reached',
                `You can only display up to ${MAX_ACTIVE_STOPS} stops at once. Please deactivate a stop first.`,
                'warning'
            );
            return;
        }
        
        // Add to active stops
        activeStopIds.push(stopId);
        itemElement.classList.add('active');
    } else {
        // Remove from active stops
        activeStopIds = activeStopIds.filter(id => id !== stopId);
        itemElement.classList.remove('active');
    }
    
    // Update UI to reflect new state
    updateStopUiState();
    
    // Save active stops to localStorage
    saveActiveStops();
    
    // Refresh the map display
    refreshMapDisplay();
    
    // Show confirmation
    const stopName = itemElement.querySelector('.stop-name').textContent;
    showNotification(
        isActive ? 'Stop Activated' : 'Stop Deactivated',
        `Bus stop "${stopName}" has been ${isActive ? 'added to' : 'removed from'} the display`,
        isActive ? 'success' : 'info'
    );
}

// Function to update UI based on current active stops
function updateStopUiState() {
    // Update the count in the filter info
    const countElement = document.querySelector('.stop-filter-info .count');
    if (countElement) {
        countElement.textContent = activeStopIds.length;
    }
    
    // Enable/disable toggles based on max limit
    const stopItems = document.querySelectorAll('.stop-item');
    stopItems.forEach(item => {
        const toggle = item.querySelector('.stop-toggle');
        const stopId = item.getAttribute('data-stop-id');
        const isActive = activeStopIds.includes(stopId);
        
        if (activeStopIds.length >= MAX_ACTIVE_STOPS && !isActive) {
            item.classList.add('disabled');
            toggle.disabled = true;
        } else {
            item.classList.remove('disabled');
            toggle.disabled = false;
        }
    });
}

// Function to reset all stops
function resetAllStops() {
    // Clear active stops
    activeStopIds = [];
    
    // Update UI
    const stopItems = document.querySelectorAll('.stop-item');
    stopItems.forEach(item => {
        item.classList.remove('active', 'disabled');
        const toggle = item.querySelector('.stop-toggle');
        toggle.checked = false;
        toggle.disabled = false;
    });
    
    // Update the count
    const countElement = document.querySelector('.stop-filter-info .count');
    if (countElement) {
        countElement.textContent = '0';
    }
    
    // Save to localStorage
    saveActiveStops();
    
    // Refresh the map display
    refreshMapDisplay();
    
    // Show confirmation
    showNotification(
        'Stops Reset',
        'All bus stops have been reset',
        'info'
    );
}

// Filter stop items based on search term
function filterStopItems(searchTerm) {
    const stopItems = document.querySelectorAll('.stop-item');
    let matchCount = 0;
    
    stopItems.forEach(item => {
        const stopName = item.querySelector('.stop-name').textContent.toLowerCase();
        const stopId = item.querySelector('.stop-id').textContent.toLowerCase();
        
        if (stopName.includes(searchTerm) || stopId.includes(searchTerm)) {
            item.style.display = 'flex';
            matchCount++;
        } else {
            item.style.display = 'none';
        }
    });
    
    // Show no results message if needed
    const noResultsMsg = document.querySelector('.no-stops-results');
    if (matchCount === 0 && searchTerm.length > 0) {
        if (!noResultsMsg) {
            const container = document.querySelector('.stops-container');
            const msg = document.createElement('div');
            msg.className = 'no-stops-message no-stops-results';
            msg.textContent = `No stops matching "${searchTerm}"`;
            container.appendChild(msg);
        }
    } else if (noResultsMsg) {
        noResultsMsg.remove();
    }
}

// Save active stops to localStorage
function saveActiveStops() {
    try {
        localStorage.setItem('activeStopIds', JSON.stringify(activeStopIds));
    } catch (err) {
        console.error('Error saving active stops:', err);
    }
}

// Load active stops from localStorage
function loadActiveStops() {
    try {
        const saved = localStorage.getItem('activeStopIds');
        if (saved) {
            activeStopIds = JSON.parse(saved);
            // Limit to max allowed if somehow more were saved
            if (activeStopIds.length > MAX_ACTIVE_STOPS) {
                activeStopIds = activeStopIds.slice(0, MAX_ACTIVE_STOPS);
            }
        }
    } catch (err) {
        console.error('Error loading active stops:', err);
        activeStopIds = [];
    }
}

// Function to refresh the map display based on active stops
function refreshMapDisplay() {
    // Don't update if we're already in an update
    if (busData.buses && busData.stops) {
        updateData();
    }
}

// Emergency preloader removal - safety measure
window.addEventListener('load', function() {
    setTimeout(function() {
        const preloader = document.getElementById('preloader');
        if (preloader && getComputedStyle(preloader).display !== 'none') {
            console.warn('Emergency preloader removal triggered');
            preloader.style.opacity = '0';
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500);
        }
    }, 12000); // 12 seconds as final fallback
});