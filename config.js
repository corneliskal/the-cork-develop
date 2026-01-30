// ============================
// The Cork - Configuration
// Vul hier je API keys in
// ============================

const CONFIG = {
    // OpenAI API Key voor wijnlabel herkenning
    // Haal je key op: https://platform.openai.com/api-keys
    OPENAI_API_KEY: 'YOUR-OPENAI-KEY-HERE',

    // Google Custom Search API Key
    // Haal je key op: https://console.cloud.google.com/apis/credentials
    GOOGLE_API_KEY: 'YOUR-GOOGLE-API-KEY-HERE',

    // Google Custom Search Engine ID (cx)
    // Maak een zoekmachine op: https://programmablesearchengine.google.com/
    GOOGLE_SEARCH_ENGINE_ID: 'YOUR-SEARCH-ENGINE-ID-HERE',

    // ============================
    // Firebase Configuration
    // ============================
    // Maak een gratis Firebase project aan op: https://console.firebase.google.com/
    // 1. Klik op "Add project" en volg de stappen
    // 2. Ga naar Project Settings > General > Your apps > Web app
    // 3. Kopieer de firebaseConfig waarden hieronder
    // 4. Ga naar Realtime Database > Create Database > Start in test mode
    // 5. Ga naar Authentication > Sign-in method > Anonymous > Enable
    FIREBASE: {
        apiKey: "AIzaSyCf49GNUSVnl5Va3waIGFU2WcZsqo8e6Z0",
        authDomain: "the-cork-claude.firebaseapp.com",
        databaseURL: "https://the-cork-claude-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "the-cork-claude",
        storageBucket: "the-cork-claude.firebasestorage.app",
        messagingSenderId: "315353039539",
        appId: "1:315353039539:web:85f20655096ae78062e6c6",
        measurementId: "G-T2WNRF19ZT"
    }
};
