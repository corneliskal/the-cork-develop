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
        apiKey: "YOUR-FIREBASE-API-KEY",
        authDomain: "YOUR-PROJECT-ID.firebaseapp.com",
        databaseURL: "https://YOUR-PROJECT-ID-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "YOUR-PROJECT-ID",
        storageBucket: "YOUR-PROJECT-ID.appspot.com",
        messagingSenderId: "YOUR-SENDER-ID",
        appId: "YOUR-APP-ID"
    }
};
