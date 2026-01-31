// ============================
// The Cork - Wine Cellar App
// With ChatGPT Vision API Integration
// And Firebase Cloud Sync
// ============================

class WineCellar {
    constructor() {
        this.wines = [];
        this.filteredWines = [];
        this.archive = [];
        this.filteredArchive = [];
        this.currentWineId = null;
        this.currentArchiveId = null;
        this.editMode = false;
        this.currentImage = null;
        this.apiKey = null;
        this.googleApiKey = null;
        this.googleSearchEngineId = null;
        this.searchQuery = '';
        this.archiveSearchQuery = '';

        // Archive modal state
        this.archiveRating = 0;
        this.archiveRebuy = null;

        // Firebase
        this.db = null;
        this.userId = null;
        this.firebaseEnabled = false;
        this.syncInProgress = false;

        this.init();
    }

    async init() {
        this.loadApiKey();
        this.loadGoogleKeys();
        this.bindEvents();

        // Initialize Firebase - user must be logged in to use app
        await this.initFirebase();
    }

    // ============================
    // Firebase Integration
    // ============================

    async initFirebase() {
        // Check if Firebase config is available and valid
        if (typeof CONFIG === 'undefined' || !CONFIG.FIREBASE ||
            !CONFIG.FIREBASE.apiKey || CONFIG.FIREBASE.apiKey.includes('YOUR')) {
            console.log('Firebase not configured - app requires login');
            this.updateSyncStatus('local');
            this.showAppContent(false);
            return;
        }

        try {
            // Initialize Firebase
            if (!firebase.apps.length) {
                firebase.initializeApp(CONFIG.FIREBASE);
            }

            this.db = firebase.database();
            this.updateSyncStatus('connecting');

            // Listen for auth state changes
            firebase.auth().onAuthStateChanged((user) => {
                if (user) {
                    this.userId = user.uid;
                    this.firebaseEnabled = true;
                    this.setupFirebaseListener();
                    this.updateSyncStatus('synced');
                    this.updateAuthUI(user);
                    this.showAppContent(true);
                    console.log('Signed in as:', user.displayName || 'Anonymous', '- UID:', user.uid);
                } else {
                    this.firebaseEnabled = false;
                    this.userId = null;
                    this.wines = [];
                    this.archive = [];
                    this.updateSyncStatus('disconnected');
                    this.updateAuthUI(null);
                    this.showAppContent(false);
                    this.renderWineList();
                    this.updateStats();
                }
            });

        } catch (error) {
            console.error('Firebase initialization error:', error);
            this.updateSyncStatus('error');
            this.showToast('Cloud sync unavailable - using local storage');
        }
    }

    async signInWithGoogle() {
        try {
            this.updateSyncStatus('connecting');
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await firebase.auth().signInWithPopup(provider);
            this.showToast(`Ingelogd als ${result.user.displayName}`);
        } catch (error) {
            console.error('Google sign-in error:', error);
            if (error.code !== 'auth/popup-closed-by-user') {
                this.showToast('Inloggen mislukt: ' + error.message);
            }
            this.updateSyncStatus('disconnected');
        }
    }

    async signOut() {
        try {
            // Detach Firebase listeners before signing out
            if (this.db && this.userId) {
                this.db.ref(`users/${this.userId}/wines`).off();
                this.db.ref(`users/${this.userId}/archive`).off();
            }
            await firebase.auth().signOut();
            this.firebaseEnabled = false;
            this.userId = null;
            this.wines = [];
            this.archive = [];
            this.renderWineList();
            this.updateStats();
            this.showToast('Uitgelogd');
            this.updateSyncStatus('disconnected');
            this.showAppContent(false);
        } catch (error) {
            console.error('Sign out error:', error);
        }
    }

    showAppContent(isLoggedIn) {
        const loginScreen = document.getElementById('loginScreen');
        const mainContent = document.querySelector('.main-content');
        const fab = document.getElementById('addWineBtn');
        const searchContainer = document.getElementById('searchContainer');

        if (isLoggedIn) {
            // Show app content
            if (loginScreen) loginScreen.classList.add('hidden');
            if (mainContent) mainContent.classList.remove('hidden');
            if (fab) fab.classList.remove('hidden');
        } else {
            // Show login screen
            if (loginScreen) loginScreen.classList.remove('hidden');
            if (mainContent) mainContent.classList.add('hidden');
            if (fab) fab.classList.add('hidden');
            if (searchContainer) searchContainer.classList.add('hidden');
        }
    }

    updateAuthUI(user) {
        const userInfo = document.getElementById('userInfo');
        const signInBtn = document.getElementById('googleSignInBtn');
        const signOutBtn = document.getElementById('signOutBtn');

        if (user && !user.isAnonymous) {
            // User is signed in with Google
            if (userInfo) {
                userInfo.innerHTML = `✓ Ingelogd als <strong>${user.displayName || user.email}</strong>`;
                userInfo.style.display = 'block';
            }
            if (signInBtn) signInBtn.style.display = 'none';
            if (signOutBtn) signOutBtn.style.display = 'block';
        } else {
            // User is not signed in
            if (userInfo) userInfo.style.display = 'none';
            if (signInBtn) signInBtn.style.display = 'block';
            if (signOutBtn) signOutBtn.style.display = 'none';
        }
    }

    setupFirebaseListener() {
        if (!this.db || !this.userId) return;

        // Detach any existing listeners first
        this.db.ref(`users/${this.userId}/wines`).off();
        this.db.ref(`users/${this.userId}/archive`).off();

        // Wines listener
        const winesRef = this.db.ref(`users/${this.userId}/wines`);
        winesRef.on('value', (snapshot) => {
            console.log('📥 Firebase wines listener triggered. syncInProgress:', this.syncInProgress);

            if (this.syncInProgress) {
                console.log('  ⏸️ Ignoring update (sync in progress)');
                return;
            }

            const data = snapshot.val();
            const firebaseWines = data ? Object.values(data) : [];

            console.log('  📊 Firebase data received:', firebaseWines.length, 'wines');

            // Firebase is the source of truth
            this.wines = firebaseWines;

            // Sort by addedAt date (newest first)
            this.wines.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

            this.renderWineList();
            this.updateStats();
            this.updateSearchVisibility();

            console.log('  ✅ Wines synced from cloud:', this.wines.length);
        });

        // Archive listener
        const archiveRef = this.db.ref(`users/${this.userId}/archive`);
        archiveRef.on('value', (snapshot) => {
            if (this.syncInProgress) return;

            const data = snapshot.val();
            const firebaseArchive = data ? Object.values(data) : [];

            console.log('📚 Archive synced from cloud:', firebaseArchive.length, 'items');

            this.archive = firebaseArchive;
            this.archive.sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
        });
    }

    async pushWineToFirebase(wine) {
        if (!this.firebaseEnabled || !this.db || !this.userId) return;

        try {
            await this.db.ref(`users/${this.userId}/wines/${wine.id}`).set(wine);
        } catch (error) {
            console.error('Error pushing wine to Firebase:', error);
        }
    }

    async deleteWineFromFirebase(wineId) {
        if (!this.firebaseEnabled || !this.db || !this.userId) {
            console.log('❌ Cannot delete from Firebase - not enabled or no user');
            console.log('  firebaseEnabled:', this.firebaseEnabled);
            console.log('  db:', !!this.db);
            console.log('  userId:', this.userId);
            return false;
        }

        try {
            const path = `users/${this.userId}/wines/${wineId}`;
            console.log('🗑️ Deleting wine from Firebase...');
            console.log('  Wine ID:', wineId);
            console.log('  Full path:', path);

            // First check if the wine exists in Firebase
            const snapshot = await this.db.ref(path).once('value');
            console.log('  Wine exists in Firebase:', snapshot.exists());

            if (snapshot.exists()) {
                await this.db.ref(path).remove();
                console.log('✅ Wine deleted from Firebase successfully');

                // Verify the delete worked
                const verifySnapshot = await this.db.ref(path).once('value');
                console.log('  Verified deleted:', !verifySnapshot.exists());
                return true;
            } else {
                console.log('⚠️ Wine was not found in Firebase - may already be deleted');
                return true;
            }
        } catch (error) {
            console.error('❌ Error deleting wine from Firebase:', error);
            return false;
        }
    }

    async saveWinesToFirebase() {
        if (!this.firebaseEnabled || !this.db || !this.userId) return;

        this.syncInProgress = true;
        this.updateSyncStatus('syncing');

        try {
            // Convert array to object with wine IDs as keys
            const winesObject = {};
            this.wines.forEach(wine => {
                winesObject[wine.id] = wine;
            });

            await this.db.ref(`users/${this.userId}/wines`).set(winesObject);

            this.updateSyncStatus('synced');
            console.log('Wines saved to cloud');
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            this.updateSyncStatus('error');
            this.showToast('Sync error - saved locally');
        } finally {
            this.syncInProgress = false;
        }
    }

    updateSyncStatus(status) {
        const statusEl = document.getElementById('syncStatus');
        const settingsStatusEl = document.getElementById('firebaseSyncStatus');

        const statusMap = {
            'local': { icon: '💾', text: 'Lokale opslag', class: 'status-local', settingsText: 'Niet geconfigureerd - Data wordt alleen lokaal opgeslagen' },
            'connecting': { icon: '🔄', text: 'Verbinden...', class: 'status-connecting', settingsText: 'Verbinden met cloud...' },
            'synced': { icon: '☁️', text: 'Cloud sync', class: 'status-synced', settingsText: '✓ Verbonden - Je wijnen worden automatisch gesynchroniseerd' },
            'syncing': { icon: '🔄', text: 'Syncing...', class: 'status-syncing', settingsText: 'Synchroniseren...' },
            'error': { icon: '⚠️', text: 'Sync error', class: 'status-error', settingsText: '⚠️ Synchronisatie fout - Probeer later opnieuw' },
            'disconnected': { icon: '📴', text: 'Offline', class: 'status-disconnected', settingsText: 'Offline - Data wordt lokaal opgeslagen' }
        };

        const s = statusMap[status] || statusMap['local'];

        if (statusEl) {
            statusEl.innerHTML = `<span class="${s.class}">${s.icon} ${s.text}</span>`;
        }

        if (settingsStatusEl) {
            const statusClass = status === 'synced' ? 'status-connected' : 'status-disconnected';
            settingsStatusEl.innerHTML = `<span class="${statusClass}">${s.settingsText}</span>`;
        }
    }

    // ============================
    // Wine Storage (Firebase only)
    // ============================

    saveWines() {
        if (this.firebaseEnabled) {
            this.saveWinesToFirebase();
        }
    }

    // ============================
    // Archive Storage (Firebase only)
    // ============================

    async pushToArchive(archivedWine) {
        this.archive.unshift(archivedWine);

        if (this.firebaseEnabled && this.db && this.userId) {
            try {
                await this.db.ref(`users/${this.userId}/archive/${archivedWine.id}`).set(archivedWine);
            } catch (error) {
                console.error('Error pushing to archive in Firebase:', error);
            }
        }
    }

    async deleteFromArchive(archiveId) {
        this.archive = this.archive.filter(w => w.id !== archiveId);

        if (this.firebaseEnabled && this.db && this.userId) {
            try {
                await this.db.ref(`users/${this.userId}/archive/${archiveId}`).remove();
            } catch (error) {
                console.error('Error deleting from archive in Firebase:', error);
            }
        }
    }

    loadApiKey() {
        // Eerst proberen uit localStorage, anders uit config.js
        this.apiKey = localStorage.getItem('openaiApiKey');
        if (!this.apiKey && typeof CONFIG !== 'undefined' && CONFIG.OPENAI_API_KEY && !CONFIG.OPENAI_API_KEY.includes('YOUR')) {
            this.apiKey = CONFIG.OPENAI_API_KEY;
            localStorage.setItem('openaiApiKey', this.apiKey);
        }
        this.updateApiKeyStatus();
    }

    saveApiKey(key) {
        this.apiKey = key;
        if (key) {
            localStorage.setItem('openaiApiKey', key);
        } else {
            localStorage.removeItem('openaiApiKey');
        }
        this.updateApiKeyStatus();
    }

    updateApiKeyStatus() {
        const statusEl = document.getElementById('apiKeyStatus');
        const inputEl = document.getElementById('apiKeyInput');

        if (!statusEl || !inputEl) return;

        if (this.apiKey) {
            statusEl.innerHTML = '<span class="status-connected">✓ Connected</span>';
            inputEl.value = '••••••••••••' + this.apiKey.slice(-4);
            inputEl.type = 'password';
        } else {
            statusEl.innerHTML = '<span class="status-disconnected">Not configured</span>';
            inputEl.value = '';
        }
    }

    // Google Custom Search API keys
    loadGoogleKeys() {
        // Eerst proberen uit localStorage, anders uit config.js
        this.googleApiKey = localStorage.getItem('googleApiKey');
        this.googleSearchEngineId = localStorage.getItem('googleSearchEngineId');

        // Als niet in localStorage, probeer config.js
        if (!this.googleApiKey && typeof CONFIG !== 'undefined' && CONFIG.GOOGLE_API_KEY && !CONFIG.GOOGLE_API_KEY.includes('YOUR')) {
            this.googleApiKey = CONFIG.GOOGLE_API_KEY;
            localStorage.setItem('googleApiKey', this.googleApiKey);
        }
        if (!this.googleSearchEngineId && typeof CONFIG !== 'undefined' && CONFIG.GOOGLE_SEARCH_ENGINE_ID && !CONFIG.GOOGLE_SEARCH_ENGINE_ID.includes('YOUR')) {
            this.googleSearchEngineId = CONFIG.GOOGLE_SEARCH_ENGINE_ID;
            localStorage.setItem('googleSearchEngineId', this.googleSearchEngineId);
        }

        this.updateGoogleKeyStatus();
    }

    saveGoogleKeys(apiKey, searchEngineId) {
        this.googleApiKey = apiKey;
        this.googleSearchEngineId = searchEngineId;
        if (apiKey) {
            localStorage.setItem('googleApiKey', apiKey);
        } else {
            localStorage.removeItem('googleApiKey');
        }
        if (searchEngineId) {
            localStorage.setItem('googleSearchEngineId', searchEngineId);
        } else {
            localStorage.removeItem('googleSearchEngineId');
        }
        this.updateGoogleKeyStatus();
    }

    updateGoogleKeyStatus() {
        const statusEl = document.getElementById('googleKeyStatus');
        const apiKeyInput = document.getElementById('googleApiKeyInput');
        const cxInput = document.getElementById('googleCxInput');

        if (!statusEl) return;

        if (this.googleApiKey && this.googleSearchEngineId) {
            statusEl.innerHTML = '<span class="status-connected">✓ Connected - Productfoto\'s worden automatisch gezocht</span>';
            if (apiKeyInput) {
                apiKeyInput.value = '••••••••••••' + this.googleApiKey.slice(-4);
                apiKeyInput.type = 'password';
            }
            if (cxInput) {
                cxInput.value = '••••••••' + this.googleSearchEngineId.slice(-4);
                cxInput.type = 'password';
            }
        } else {
            statusEl.innerHTML = '<span class="status-disconnected">Niet geconfigureerd - Je eigen foto wordt gebruikt</span>';
            if (apiKeyInput) apiKeyInput.value = '';
            if (cxInput) cxInput.value = '';
        }
    }

    // ============================
    // Event Binding
    // ============================

    bindEvents() {
        // Settings button
        document.getElementById('settingsBtn')?.addEventListener('click', () => this.openModal('settingsModal'));

        // Save API key
        document.getElementById('saveApiKey')?.addEventListener('click', () => this.handleSaveApiKey());

        // Clear API key
        document.getElementById('clearApiKey')?.addEventListener('click', () => {
            this.saveApiKey(null);
            document.getElementById('apiKeyInput').value = '';
            document.getElementById('apiKeyInput').type = 'text';
            this.showToast('API key removed');
        });

        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearch');

        searchInput?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            this.handleSearch();
        });

        clearSearchBtn?.addEventListener('click', () => {
            searchInput.value = '';
            this.searchQuery = '';
            this.handleSearch();
            searchInput.focus();
        });

        // FAB button
        document.getElementById('addWineBtn')?.addEventListener('click', () => this.openAddModal());

        // Close buttons
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.currentTarget.dataset.close;
                this.closeModal(modalId);
            });
        });

        // Modal backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });

        // Image upload
        document.getElementById('imagePreview')?.addEventListener('click', () => {
            document.getElementById('galleryInput')?.click();
        });

        document.getElementById('cameraBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('cameraInput')?.click();
        });

        document.getElementById('galleryBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('galleryInput')?.click();
        });

        document.getElementById('cameraInput')?.addEventListener('change', (e) => this.handleImageUpload(e));
        document.getElementById('galleryInput')?.addEventListener('change', (e) => this.handleImageUpload(e));

        // Form submission
        document.getElementById('wineForm')?.addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Characteristic sliders
        ['boldness', 'tannins', 'acidity'].forEach(id => {
            const slider = document.getElementById(id);
            const value = document.getElementById(`${id}Value`);
            slider?.addEventListener('input', () => {
                if (value) value.textContent = slider.value;
            });
        });

        // Quantity controls in form
        document.querySelectorAll('.quantity-control .qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById('wineQuantity');
                const action = btn.dataset.action;
                let val = parseInt(input.value) || 1;
                if (action === 'increase') val++;
                if (action === 'decrease' && val > 1) val--;
                input.value = val;
            });
        });

        // Detail modal quantity controls
        document.getElementById('detailIncrease')?.addEventListener('click', () => this.updateDetailQuantity(1));
        document.getElementById('detailDecrease')?.addEventListener('click', () => this.updateDetailQuantity(-1));

        // Detail modal actions
        document.getElementById('editWineBtn')?.addEventListener('click', () => this.editCurrentWine());
        document.getElementById('deleteWineBtn')?.addEventListener('click', () => this.openDeleteModal());

        // Allow showing/hiding API key
        document.getElementById('apiKeyInput')?.addEventListener('focus', function() {
            if (this.value.startsWith('••••')) {
                this.value = '';
                this.type = 'text';
            }
        });

        // Google API keys
        document.getElementById('saveGoogleKeys')?.addEventListener('click', () => this.handleSaveGoogleKeys());
        document.getElementById('clearGoogleKeys')?.addEventListener('click', () => {
            this.saveGoogleKeys(null, null);
            document.getElementById('googleApiKeyInput').value = '';
            document.getElementById('googleApiKeyInput').type = 'text';
            document.getElementById('googleCxInput').value = '';
            document.getElementById('googleCxInput').type = 'text';
            this.showToast('Google keys verwijderd');
        });

        document.getElementById('googleApiKeyInput')?.addEventListener('focus', function() {
            if (this.value.startsWith('••••')) {
                this.value = '';
                this.type = 'text';
            }
        });

        document.getElementById('googleCxInput')?.addEventListener('focus', function() {
            if (this.value.startsWith('••••')) {
                this.value = '';
                this.type = 'text';
            }
        });

        // Google Sign-In / Sign-Out buttons
        document.getElementById('googleSignInBtn')?.addEventListener('click', () => this.signInWithGoogle());
        document.getElementById('loginGoogleBtn')?.addEventListener('click', () => this.signInWithGoogle());
        document.getElementById('signOutBtn')?.addEventListener('click', () => this.signOut());

        // Archive button
        document.getElementById('archiveBtn')?.addEventListener('click', () => this.openArchiveList());

        // Archive modal - Star rating
        document.querySelectorAll('#archiveRating .star').forEach(star => {
            star.addEventListener('click', () => this.setArchiveRating(parseInt(star.dataset.rating)));
            star.addEventListener('mouseenter', () => this.previewRating(parseInt(star.dataset.rating)));
            star.addEventListener('mouseleave', () => this.previewRating(0));
        });

        // Archive modal - Rebuy options
        document.querySelectorAll('#rebuyOptions .rebuy-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setRebuyOption(btn.dataset.rebuy));
        });

        // Archive modal - Actions
        document.getElementById('skipArchive')?.addEventListener('click', () => this.skipArchiveAndDelete());
        document.getElementById('confirmArchive')?.addEventListener('click', () => this.confirmArchive());

        // Archive list - Search
        const archiveSearchInput = document.getElementById('archiveSearchInput');
        const clearArchiveSearchBtn = document.getElementById('clearArchiveSearch');

        archiveSearchInput?.addEventListener('input', (e) => {
            this.archiveSearchQuery = e.target.value.trim().toLowerCase();
            this.filterAndRenderArchive();
        });

        clearArchiveSearchBtn?.addEventListener('click', () => {
            archiveSearchInput.value = '';
            this.archiveSearchQuery = '';
            this.filterAndRenderArchive();
        });

        // Archive list - Filters
        document.getElementById('archiveTypeFilter')?.addEventListener('change', () => this.filterAndRenderArchive());
        document.getElementById('archiveRebuyFilter')?.addEventListener('change', () => this.filterAndRenderArchive());

        // Archive detail - Actions
        document.getElementById('restoreWineBtn')?.addEventListener('click', () => this.restoreWineFromArchive());
        document.getElementById('deleteArchiveBtn')?.addEventListener('click', () => this.deleteFromArchiveConfirm());
    }

    handleSaveGoogleKeys() {
        const apiKeyInput = document.getElementById('googleApiKeyInput');
        const cxInput = document.getElementById('googleCxInput');
        const apiKey = apiKeyInput.value.trim();
        const cx = cxInput.value.trim();

        if (apiKey && !apiKey.startsWith('••••') && cx && !cx.startsWith('••••')) {
            this.saveGoogleKeys(apiKey, cx);
            this.showToast('Google keys opgeslagen!');
        } else if (!apiKey || !cx) {
            this.showToast('Vul beide velden in');
        }
    }

    handleSaveApiKey() {
        const input = document.getElementById('apiKeyInput');
        const key = input.value.trim();

        if (key && !key.startsWith('••••')) {
            if (key.startsWith('sk-')) {
                this.saveApiKey(key);
                this.showToast('API key saved!');
            } else {
                this.showToast('Invalid API key format');
            }
        }
    }

    // ============================
    // Modal Management
    // ============================

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        document.body.style.overflow = '';

        if (modalId === 'addModal') {
            this.resetForm();
        }
    }

    openAddModal() {
        this.editMode = false;
        this.currentWineId = null;
        this.resetForm();
        document.querySelector('#addModal .modal-header h2').textContent = 'Add Wine';
        document.querySelector('#addModal .submit-btn').textContent = 'Add to Cellar';
        this.openModal('addModal');
    }

    resetForm() {
        document.getElementById('wineForm').reset();
        document.getElementById('imagePreview').classList.remove('has-image');
        document.getElementById('previewImg').src = '';
        this.currentImage = null;

        ['boldness', 'tannins', 'acidity'].forEach(id => {
            document.getElementById(id).value = 3;
            document.getElementById(`${id}Value`).textContent = '3';
        });

        document.getElementById('wineQuantity').value = 1;
        document.getElementById('scanningIndicator').classList.add('hidden');
    }

    // ============================
    // Image Handling & AI Analysis
    // ============================

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Compress and resize image to prevent localStorage quota issues
        this.compressImage(file, (compressedImageData) => {
            this.currentImage = compressedImageData;

            const preview = document.getElementById('previewImg');
            preview.src = compressedImageData;
            document.getElementById('imagePreview').classList.add('has-image');

            this.analyzeWineLabel(compressedImageData);
        });

        e.target.value = '';
    }

    compressImage(file, callback) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxSize = 800; // Max width/height
                let { width, height } = img;

                // Resize if needed
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with 0.7 quality
                const compressedData = canvas.toDataURL('image/jpeg', 0.7);
                callback(compressedData);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    async analyzeWineLabel(imageData) {
        const indicator = document.getElementById('scanningIndicator');
        const indicatorText = indicator.querySelector('p');

        indicator.classList.remove('hidden');

        if (!this.apiKey) {
            indicatorText.textContent = 'No API key - using demo mode...';
            setTimeout(() => {
                indicator.classList.add('hidden');
                const wineData = this.generateDemoWineData();
                this.populateForm(wineData);
                this.showToast('Demo mode: Add API key in ⚙️ for real recognition');
            }, 1500);
            return;
        }

        indicatorText.textContent = 'Analyzing wine label with AI...';

        try {
            const wineData = await this.callChatGPTVision(imageData);
            this.populateForm(wineData);

            // Zoek productfoto via Google als keys zijn geconfigureerd
            if (this.googleApiKey && this.googleSearchEngineId && wineData.name && wineData.producer) {
                indicatorText.textContent = 'Zoeken naar productfoto...';
                try {
                    const productImage = await this.searchGoogleImage(wineData);
                    if (productImage) {
                        this.showToast('Wijn herkend met productfoto!');
                    } else {
                        this.showToast('Wijn herkend! Geen productfoto gevonden.');
                    }
                } catch (imgError) {
                    console.log('Could not load product image:', imgError);
                    this.showToast('Wijn herkend! Productfoto niet beschikbaar.');
                }
            } else {
                this.showToast('Wijn herkend! Controleer de gegevens.');
            }

            indicator.classList.add('hidden');
        } catch (error) {
            console.error('Vision API error:', error);
            indicator.classList.add('hidden');

            if (error.message.includes('401')) {
                this.showToast('Invalid API key. Check settings.');
            } else if (error.message.includes('429')) {
                this.showToast('Rate limited. Try again in a moment.');
            } else {
                this.showToast('Could not analyze image. Enter details manually.');
            }
        }
    }

    async searchGoogleImage(wineData) {
        const searchQuery = `${wineData.producer} ${wineData.name} bottle png`;

        console.log('🔍 Google Image Search Query:', searchQuery);

        const url = `https://www.googleapis.com/customsearch/v1?` +
            `key=${this.googleApiKey}` +
            `&cx=${this.googleSearchEngineId}` +
            `&q=${encodeURIComponent(searchQuery)}` +
            `&searchType=image` +
            `&num=5` +
            `&imgType=photo` +
            `&safe=active`;

        console.log('🌐 API URL:', url.replace(this.googleApiKey, 'API_KEY_HIDDEN'));

        const response = await fetch(url);

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Google API Error:', errorText);
            throw new Error(`Google API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        console.log('📦 Google API Response:', data);

        if (data.error) {
            console.error('❌ Google API Error in response:', data.error);
            throw new Error(`Google API error: ${data.error.message}`);
        }

        if (!data.items || data.items.length === 0) {
            console.log('⚠️ No images found for query');
            return null;
        }

        console.log(`✅ Found ${data.items.length} images:`);
        data.items.forEach((item, i) => {
            console.log(`  ${i + 1}. ${item.link}`);
        });

        // Probeer de eerste 5 afbeeldingen totdat er een werkt
        for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i];
            try {
                console.log(`🖼️ Trying to load image ${i + 1}: ${item.link}`);
                const loaded = await this.loadExternalImage(item.link);
                if (loaded) {
                    console.log(`✅ Successfully loaded image ${i + 1}`);
                    return loaded;
                }
            } catch (e) {
                console.log(`❌ Image ${i + 1} failed:`, e.message);
                continue;
            }
        }

        console.log('⚠️ All images failed to load (CORS issues)');
        return null;
    }

    async loadExternalImage(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const timeout = setTimeout(() => {
                reject(new Error('Image load timeout'));
            }, 8000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    // Converteer naar canvas om als base64 op te slaan
                    const canvas = document.createElement('canvas');
                    const maxSize = 800;
                    let { width, height } = img;

                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height / width) * maxSize;
                            width = maxSize;
                        } else {
                            width = (width / height) * maxSize;
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedData = canvas.toDataURL('image/jpeg', 0.8);

                    // Update preview en currentImage
                    this.currentImage = compressedData;
                    const preview = document.getElementById('previewImg');
                    preview.src = compressedData;
                    document.getElementById('imagePreview').classList.add('has-image');

                    resolve(compressedData);
                } catch (e) {
                    reject(e);
                }
            };

            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Failed to load image'));
            };

            img.src = imageUrl;
        });
    }

    async callChatGPTVision(imageData) {
        const prompt = `Je bent een sommelier en wijnexpert. Analyseer deze foto van een wijnetiket en extraheer alle informatie.

Return ONLY a valid JSON object with these fields (use null for unknown values):
{
    "name": "Wijnnaam (zonder producent, bijv. 'Grand Vin', 'Reserva', 'Cuvée Prestige')",
    "producer": "Producent/domein/château naam",
    "type": "red" or "white" or "rosé" or "sparkling" or "dessert",
    "year": vintage year as number or null,
    "region": "Wijnregio en land (bijv. 'Bordeaux, Frankrijk')",
    "grape": "Druivenras(sen) - als niet zichtbaar, geef de typische druiven voor deze wijn/regio",
    "boldness": 1-5 scale (1=licht, 5=vol/krachtig),
    "tannins": 1-5 scale (1=zacht, 5=stevig tannine),
    "acidity": 1-5 scale (1=zacht, 5=fris/hoog zuur),
    "sweetness": 1-5 scale (1=droog, 5=zoet),
    "price": geschatte gemiddelde winkelprijs in euros als nummer,
    "description": "Proefnotities in het Nederlands: aroma's, smaak, body, afdronk. Wees specifiek over fruit, kruiden, hout, etc.",
    "foodPairing": "Suggesties voor gerechten die goed passen bij deze wijn (in het Nederlands)",
    "drinkWindow": "Optimale drinkperiode (bijv. '2024-2030' of 'Nu drinken')",
    "alcohol": alcohol percentage als nummer (bijv. 13.5),
    "classification": "Classificatie indien van toepassing (bijv. 'Grand Cru Classé', 'DOCG', 'Premier Cru')"
}

BELANGRIJK:
- Scheid wijnnaam van producent. De producent is het wijnhuis/château/domaine.
- Baseer karakteristieken op typische profielen voor dit wijntype en deze regio.
- Geef realistische prijsschatting voor Nederlandse/Belgische winkels.
- Beschrijf proefnotities alsof je de wijn daadwerkelijk proeft.
- Als je iets niet kunt zien op het etiket maar wel kunt afleiden uit de wijn/regio, geef dan je beste inschatting.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageData, detail: 'high' } }
                        ]
                    }
                ],
                max_tokens: 800
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }

        return JSON.parse(jsonStr.trim());
    }

    generateDemoWineData() {
        const wines = [
            { name: 'Grand Vin', producer: 'Château Margaux', type: 'red', year: 2015, region: 'Margaux, Bordeaux, France', grape: 'Cabernet Sauvignon, Merlot', boldness: 4, tannins: 4, acidity: 3, price: 450, description: 'Elegant with blackcurrant, violet, and cedar notes.' },
            { name: 'Sauvignon Blanc', producer: 'Cloudy Bay', type: 'white', year: 2022, region: 'Marlborough, New Zealand', grape: 'Sauvignon Blanc', boldness: 2, tannins: 1, acidity: 4, price: 28, description: 'Crisp with citrus and passion fruit.' },
            { name: 'Whispering Angel', producer: 'Château d\'Esclans', type: 'rosé', year: 2023, region: 'Provence, France', grape: 'Grenache, Cinsault', boldness: 2, tannins: 1, acidity: 3, price: 22, description: 'Delicate strawberry and peach flavors.' },
            { name: 'Tignanello', producer: 'Antinori', type: 'red', year: 2019, region: 'Tuscany, Italy', grape: 'Sangiovese, Cabernet Sauvignon', boldness: 5, tannins: 4, acidity: 4, price: 120, description: 'Rich with cherry, plum, and spicy oak.' },
            { name: 'Brut Vintage', producer: 'Dom Pérignon', type: 'sparkling', year: 2012, region: 'Champagne, France', grape: 'Chardonnay, Pinot Noir', boldness: 3, tannins: 1, acidity: 4, price: 200, description: 'Fine bubbles with brioche and citrus.' }
        ];
        return wines[Math.floor(Math.random() * wines.length)];
    }

    populateForm(data) {
        document.getElementById('wineName').value = data.name || '';
        document.getElementById('wineProducer').value = data.producer || '';
        document.getElementById('wineType').value = data.type || 'red';
        document.getElementById('wineYear').value = data.year || '';
        document.getElementById('wineRegion').value = data.region || '';
        document.getElementById('wineGrape').value = data.grape || '';
        document.getElementById('winePrice').value = data.price || '';

        if (data.description) {
            document.getElementById('wineNotes').value = data.description;
        }

        ['boldness', 'tannins', 'acidity'].forEach(id => {
            const value = data[id] || 3;
            document.getElementById(id).value = value;
            document.getElementById(`${id}Value`).textContent = value;
        });
    }

    // ============================
    // Form Handling
    // ============================

    handleFormSubmit(e) {
        e.preventDefault();

        const wineData = {
            id: this.editMode ? this.currentWineId : Date.now().toString(),
            name: document.getElementById('wineName').value,
            producer: document.getElementById('wineProducer').value || null,
            type: document.getElementById('wineType').value,
            year: document.getElementById('wineYear').value || null,
            region: document.getElementById('wineRegion').value || null,
            grape: document.getElementById('wineGrape').value || null,
            boldness: parseInt(document.getElementById('boldness').value),
            tannins: parseInt(document.getElementById('tannins').value),
            acidity: parseInt(document.getElementById('acidity').value),
            price: parseFloat(document.getElementById('winePrice').value) || null,
            quantity: parseInt(document.getElementById('wineQuantity').value) || 1,
            store: document.getElementById('wineStore').value || null,
            notes: document.getElementById('wineNotes').value || null,
            image: this.currentImage,
            addedAt: this.editMode ? this.wines.find(w => w.id === this.currentWineId)?.addedAt : new Date().toISOString()
        };

        if (this.editMode) {
            const index = this.wines.findIndex(w => w.id === this.currentWineId);
            if (index !== -1) this.wines[index] = wineData;
            this.showToast('Wine updated!');
        } else {
            this.wines.unshift(wineData);
            this.showToast('Wine added to cellar!');
        }

        this.saveWines();
        this.renderWineList();
        this.updateStats();
        this.closeModal('addModal');
    }

    // ============================
    // Search Functionality
    // ============================

    updateSearchVisibility() {
        const searchContainer = document.getElementById('searchContainer');
        if (this.wines.length > 0) {
            searchContainer?.classList.remove('hidden');
        } else {
            searchContainer?.classList.add('hidden');
        }
    }

    handleSearch() {
        const clearBtn = document.getElementById('clearSearch');
        const resultsDiv = document.getElementById('searchResults');
        const resultCount = document.getElementById('searchResultCount');

        if (this.searchQuery) {
            clearBtn?.classList.remove('hidden');
            resultsDiv?.classList.remove('hidden');

            // Filter wines by name, producer, region, or grape
            this.filteredWines = this.wines.filter(wine => {
                const name = (wine.name || '').toLowerCase();
                const producer = (wine.producer || '').toLowerCase();
                const region = (wine.region || '').toLowerCase();
                const grape = (wine.grape || '').toLowerCase();

                return name.includes(this.searchQuery) ||
                       producer.includes(this.searchQuery) ||
                       region.includes(this.searchQuery) ||
                       grape.includes(this.searchQuery);
            });

            resultCount.textContent = `${this.filteredWines.length} result${this.filteredWines.length !== 1 ? 's' : ''}`;
        } else {
            clearBtn?.classList.add('hidden');
            resultsDiv?.classList.add('hidden');
            this.filteredWines = [];
        }

        this.renderWineList();
    }

    // ============================
    // Wine List Rendering
    // ============================

    renderWineList() {
        const list = document.getElementById('wineList');
        const emptyState = document.getElementById('emptyState');

        // Determine which wines to show
        const winesToShow = this.searchQuery ? this.filteredWines : this.wines;

        if (this.wines.length === 0) {
            list.innerHTML = '';
            emptyState.classList.remove('hidden');
            this.updateSearchVisibility();
            return;
        }

        emptyState.classList.add('hidden');
        this.updateSearchVisibility();

        // Show no results message if search returned nothing
        if (this.searchQuery && winesToShow.length === 0) {
            list.innerHTML = `
                <div class="no-results">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <p>No wines found for "${this.escapeHtml(this.searchQuery)}"</p>
                </div>
            `;
            return;
        }

        list.innerHTML = winesToShow.map(wine => `
            <div class="wine-card" data-id="${wine.id}">
                <div class="wine-card-image">
                    ${wine.image
                        ? `<img src="${wine.image}" alt="${wine.name}">`
                        : `<div class="placeholder-image ${wine.type}">🍷</div>`
                    }
                </div>
                <div class="wine-card-info">
                    <h3 class="wine-card-name">${this.highlightMatch(wine.name)}</h3>
                    ${wine.producer ? `<p class="wine-card-producer">${this.highlightMatch(wine.producer)}</p>` : ''}
                    <p class="wine-card-meta">${this.highlightMatch([wine.grape, wine.year].filter(Boolean).join(' · ') || wine.region || 'No details')}</p>
                    <div class="wine-card-footer">
                        <span class="wine-type-tag ${wine.type}">${wine.type}</span>
                        <span class="wine-quantity">${wine.quantity} fles${wine.quantity !== 1 ? 'sen' : ''}</span>
                    </div>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.wine-card').forEach(card => {
            card.addEventListener('click', () => this.openDetailModal(card.dataset.id));
        });
    }

    highlightMatch(text) {
        if (!this.searchQuery || !text) return this.escapeHtml(text || '');

        const escaped = this.escapeHtml(text);
        const regex = new RegExp(`(${this.escapeRegex(this.searchQuery)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    updateStats() {
        const totalBottles = this.wines.reduce((sum, wine) => sum + wine.quantity, 0);
        document.getElementById('totalBottles').textContent = totalBottles;
    }

    // ============================
    // Detail Modal
    // ============================

    openDetailModal(wineId) {
        const wine = this.wines.find(w => w.id === wineId);
        if (!wine) return;

        this.currentWineId = wineId;

        const detailImage = document.getElementById('detailImage');
        if (wine.image) {
            detailImage.innerHTML = `<img src="${wine.image}" alt="${wine.name}"><div class="wine-type-badge">${wine.type}</div>`;
        } else {
            detailImage.innerHTML = `<div class="placeholder-bg ${wine.type}"><span style="font-size: 3rem;">🍷</span></div><div class="wine-type-badge">${wine.type}</div>`;
        }

        document.getElementById('detailName').textContent = wine.name;

        const producerEl = document.getElementById('detailProducer');
        if (wine.producer) {
            producerEl.textContent = wine.producer;
            producerEl.style.display = 'block';
        } else {
            producerEl.style.display = 'none';
        }

        document.getElementById('detailRegion').textContent = wine.region || 'Region not specified';
        document.getElementById('detailYear').textContent = wine.year || '—';
        document.getElementById('detailGrape').textContent = wine.grape || '—';
        document.getElementById('detailPrice').textContent = wine.price ? `€${wine.price.toFixed(2)}` : '—';

        document.getElementById('detailBoldness').style.width = `${wine.boldness * 20}%`;
        document.getElementById('detailTannins').style.width = `${wine.tannins * 20}%`;
        document.getElementById('detailAcidity').style.width = `${wine.acidity * 20}%`;

        const storeSection = document.getElementById('detailStoreSection');
        const storeText = document.getElementById('detailStore');
        if (wine.store) {
            storeSection.style.display = 'flex';
            storeText.textContent = wine.store;
        } else {
            storeSection.style.display = 'none';
        }

        const notesSection = document.getElementById('detailNotesSection');
        const notesText = document.getElementById('detailNotes');
        if (wine.notes) {
            notesSection.style.display = 'block';
            notesText.textContent = wine.notes;
        } else {
            notesSection.style.display = 'none';
        }

        document.getElementById('detailQuantity').textContent = wine.quantity;
        this.openModal('detailModal');
    }

    updateDetailQuantity(change) {
        const wine = this.wines.find(w => w.id === this.currentWineId);
        if (!wine) return;

        const newQty = wine.quantity + change;
        if (newQty < 1) return;

        wine.quantity = newQty;
        this.saveWines();

        document.getElementById('detailQuantity').textContent = newQty;
        this.renderWineList();
        this.updateStats();
    }

    // ============================
    // Edit Wine
    // ============================

    editCurrentWine() {
        const wine = this.wines.find(w => w.id === this.currentWineId);
        if (!wine) return;

        this.closeModal('detailModal');

        setTimeout(() => {
            this.editMode = true;
            document.querySelector('#addModal .modal-header h2').textContent = 'Edit Wine';
            document.querySelector('#addModal .submit-btn').textContent = 'Save Changes';

            document.getElementById('wineName').value = wine.name;
            document.getElementById('wineProducer').value = wine.producer || '';
            document.getElementById('wineType').value = wine.type;
            document.getElementById('wineYear').value = wine.year || '';
            document.getElementById('wineRegion').value = wine.region || '';
            document.getElementById('wineGrape').value = wine.grape || '';
            document.getElementById('winePrice').value = wine.price || '';
            document.getElementById('wineQuantity').value = wine.quantity;
            document.getElementById('wineStore').value = wine.store || '';
            document.getElementById('wineNotes').value = wine.notes || '';

            ['boldness', 'tannins', 'acidity'].forEach(id => {
                document.getElementById(id).value = wine[id];
                document.getElementById(`${id}Value`).textContent = wine[id];
            });

            if (wine.image) {
                this.currentImage = wine.image;
                document.getElementById('previewImg').src = wine.image;
                document.getElementById('imagePreview').classList.add('has-image');
            }

            this.openModal('addModal');
        }, 300);
    }

    // ============================
    // Delete Wine / Archive
    // ============================

    openDeleteModal() {
        const wine = this.wines.find(w => w.id === this.currentWineId);
        if (!wine) return;

        // Reset archive modal state
        this.archiveRating = 0;
        this.archiveRebuy = null;

        // Update UI
        document.getElementById('archiveWineName').textContent = wine.producer
            ? `${wine.name} - ${wine.producer}`
            : wine.name;

        // Reset stars
        document.querySelectorAll('#archiveRating .star').forEach(star => {
            star.classList.remove('active');
        });
        document.getElementById('ratingLabel').textContent = 'Selecteer een beoordeling';

        // Reset rebuy buttons
        document.querySelectorAll('#rebuyOptions .rebuy-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Clear notes
        document.getElementById('archiveNotes').value = '';

        this.openModal('archiveModal');
    }

    setArchiveRating(rating) {
        this.archiveRating = rating;
        const labels = ['', 'Slecht', 'Matig', 'Goed', 'Heel goed', 'Uitstekend!'];
        document.getElementById('ratingLabel').textContent = labels[rating];

        document.querySelectorAll('#archiveRating .star').forEach((star, index) => {
            star.classList.toggle('active', index < rating);
        });
    }

    previewRating(rating) {
        if (rating === 0) {
            // Reset to actual rating
            document.querySelectorAll('#archiveRating .star').forEach((star, index) => {
                star.classList.remove('hover');
                star.classList.toggle('active', index < this.archiveRating);
            });
        } else {
            document.querySelectorAll('#archiveRating .star').forEach((star, index) => {
                star.classList.toggle('hover', index < rating);
            });
        }
    }

    setRebuyOption(option) {
        this.archiveRebuy = option;
        document.querySelectorAll('#rebuyOptions .rebuy-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.rebuy === option);
        });
    }

    async skipArchiveAndDelete() {
        // Just delete without archiving
        await this.deleteCurrentWine();
        this.closeModal('archiveModal');
    }

    async confirmArchive() {
        const wine = this.wines.find(w => w.id === this.currentWineId);
        if (!wine) return;

        // Create archive entry
        const archivedWine = {
            ...wine,
            rating: this.archiveRating,
            rebuy: this.archiveRebuy,
            archiveNotes: document.getElementById('archiveNotes').value.trim() || null,
            archivedAt: new Date().toISOString()
        };

        // Add to archive
        await this.pushToArchive(archivedWine);

        // Delete from cellar
        await this.deleteCurrentWine();

        this.closeModal('archiveModal');
        this.showToast('Wijn gearchiveerd!');
    }

    async deleteCurrentWine() {
        const wineIdToDelete = this.currentWineId;
        const wineName = this.wines.find(w => w.id === wineIdToDelete)?.name || 'Unknown';

        console.log('🍷 Starting delete process for:', wineName, '(ID:', wineIdToDelete, ')');

        // Set flag to prevent Firebase listener from re-adding the wine
        this.syncInProgress = true;

        // Remove from local array
        this.wines = this.wines.filter(w => w.id !== wineIdToDelete);
        console.log('  Removed from local array. Wines remaining:', this.wines.length);

        // Save locally
        this.saveToLocalStorage();
        console.log('  Saved to localStorage');

        // Delete from Firebase and wait for it to complete
        if (this.firebaseEnabled) {
            console.log('  Firebase is enabled, deleting from cloud...');
            const deleteSuccess = await this.deleteWineFromFirebase(wineIdToDelete);
            console.log('  Firebase delete result:', deleteSuccess ? 'SUCCESS' : 'FAILED');
        } else {
            console.log('  Firebase not enabled, skip cloud delete');
        }

        this.renderWineList();
        this.updateStats();
        this.updateSearchVisibility();

        this.closeModal('detailModal');

        // Reset flag after a short delay to allow Firebase to sync
        setTimeout(() => {
            this.syncInProgress = false;
            console.log('  Sync flag reset');
        }, 2000);
    }

    // ============================
    // Archive List & Detail
    // ============================

    openArchiveList() {
        // Reset search and filters
        document.getElementById('archiveSearchInput').value = '';
        document.getElementById('archiveTypeFilter').value = '';
        document.getElementById('archiveRebuyFilter').value = '';
        this.archiveSearchQuery = '';

        this.filterAndRenderArchive();
        this.openModal('archiveListModal');
    }

    filterAndRenderArchive() {
        const typeFilter = document.getElementById('archiveTypeFilter')?.value || '';
        const rebuyFilter = document.getElementById('archiveRebuyFilter')?.value || '';
        const clearBtn = document.getElementById('clearArchiveSearch');

        // Show/hide clear button
        if (this.archiveSearchQuery) {
            clearBtn?.classList.remove('hidden');
        } else {
            clearBtn?.classList.add('hidden');
        }

        // Filter archive
        this.filteredArchive = this.archive.filter(wine => {
            // Type filter
            if (typeFilter && wine.type !== typeFilter) return false;

            // Rebuy filter
            if (rebuyFilter && wine.rebuy !== rebuyFilter) return false;

            // Search query
            if (this.archiveSearchQuery) {
                const searchFields = [
                    wine.name,
                    wine.producer,
                    wine.region,
                    wine.grape,
                    wine.store
                ].filter(Boolean).join(' ').toLowerCase();

                if (!searchFields.includes(this.archiveSearchQuery)) return false;
            }

            return true;
        });

        this.renderArchiveList();
    }

    renderArchiveList() {
        const list = document.getElementById('archiveList');
        const emptyState = document.getElementById('archiveEmptyState');
        const statsEl = document.getElementById('archiveCount');

        // Update count
        statsEl.textContent = `${this.filteredArchive.length} wijn${this.filteredArchive.length !== 1 ? 'en' : ''}`;

        if (this.archive.length === 0) {
            list.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        if (this.filteredArchive.length === 0) {
            list.innerHTML = `
                <div class="no-results">
                    <p>Geen wijnen gevonden</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.filteredArchive.map(wine => {
            const stars = '★'.repeat(wine.rating || 0) + '☆'.repeat(5 - (wine.rating || 0));
            const rebuyLabels = { yes: 'Opnieuw', maybe: 'Misschien', no: 'Niet meer' };
            const rebuyLabel = rebuyLabels[wine.rebuy] || '';

            return `
                <div class="archive-card" data-id="${wine.id}">
                    <div class="archive-card-image">
                        ${wine.image
                            ? `<img src="${wine.image}" alt="${wine.name}">`
                            : `<div class="placeholder-image ${wine.type}">🍷</div>`
                        }
                    </div>
                    <div class="archive-card-info">
                        <h4 class="archive-card-name">${this.escapeHtml(wine.name)}</h4>
                        ${wine.producer ? `<p class="archive-card-producer">${this.escapeHtml(wine.producer)}</p>` : ''}
                        <div class="archive-card-meta">
                            ${wine.rating ? `<span class="archive-card-stars">${stars}</span>` : ''}
                            ${wine.rebuy ? `<span class="archive-card-rebuy ${wine.rebuy}">${rebuyLabel}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Bind click events
        list.querySelectorAll('.archive-card').forEach(card => {
            card.addEventListener('click', () => this.openArchiveDetail(card.dataset.id));
        });
    }

    openArchiveDetail(archiveId) {
        const wine = this.archive.find(w => w.id === archiveId);
        if (!wine) return;

        this.currentArchiveId = archiveId;

        // Image
        const detailImage = document.getElementById('archiveDetailImage');
        if (wine.image) {
            detailImage.innerHTML = `<img src="${wine.image}" alt="${wine.name}"><div class="wine-type-badge">${wine.type}</div>`;
        } else {
            detailImage.innerHTML = `<div class="placeholder-bg ${wine.type}"><span style="font-size: 3rem;">🍷</span></div><div class="wine-type-badge">${wine.type}</div>`;
        }

        // Basic info
        document.getElementById('archiveDetailName').textContent = wine.name;

        const producerEl = document.getElementById('archiveDetailProducer');
        if (wine.producer) {
            producerEl.textContent = wine.producer;
            producerEl.style.display = 'block';
        } else {
            producerEl.style.display = 'none';
        }

        document.getElementById('archiveDetailRegion').textContent = wine.region || 'Regio onbekend';

        // Rating display
        const starsEl = document.getElementById('archiveDetailStars');
        if (wine.rating) {
            const filledStars = '★'.repeat(wine.rating);
            const emptyStars = '☆'.repeat(5 - wine.rating);
            starsEl.innerHTML = `<span>${filledStars}</span><span class="empty">${emptyStars}</span>`;
            starsEl.parentElement.style.display = 'flex';
        } else {
            starsEl.parentElement.style.display = 'none';
        }

        // Rebuy badge
        const rebuyEl = document.getElementById('archiveDetailRebuy');
        if (wine.rebuy) {
            const rebuyConfig = {
                yes: { icon: '👍', text: 'Opnieuw kopen', class: 'yes' },
                maybe: { icon: '🤔', text: 'Misschien', class: 'maybe' },
                no: { icon: '👎', text: 'Niet meer', class: 'no' }
            };
            const config = rebuyConfig[wine.rebuy];
            rebuyEl.innerHTML = `<span class="rebuy-icon">${config.icon}</span><span>${config.text}</span>`;
            rebuyEl.className = `rebuy-badge ${config.class}`;
            rebuyEl.style.display = 'flex';
        } else {
            rebuyEl.style.display = 'none';
        }

        // Meta info
        document.getElementById('archiveDetailYear').textContent = wine.year || '—';
        document.getElementById('archiveDetailGrape').textContent = wine.grape || '—';
        document.getElementById('archiveDetailPrice').textContent = wine.price ? `€${wine.price.toFixed(2)}` : '—';

        // Store
        const storeSection = document.getElementById('archiveDetailStoreSection');
        if (wine.store) {
            storeSection.style.display = 'flex';
            document.getElementById('archiveDetailStore').textContent = wine.store;
        } else {
            storeSection.style.display = 'none';
        }

        // Characteristics
        document.getElementById('archiveDetailBoldness').style.width = `${(wine.boldness || 3) * 20}%`;
        document.getElementById('archiveDetailTannins').style.width = `${(wine.tannins || 3) * 20}%`;
        document.getElementById('archiveDetailAcidity').style.width = `${(wine.acidity || 3) * 20}%`;

        // Tasting notes
        const notesSection = document.getElementById('archiveDetailNotesSection');
        if (wine.notes) {
            notesSection.style.display = 'block';
            document.getElementById('archiveDetailNotes').textContent = wine.notes;
        } else {
            notesSection.style.display = 'none';
        }

        // Archive review
        const reviewSection = document.getElementById('archiveDetailReviewSection');
        if (wine.archiveNotes) {
            reviewSection.style.display = 'block';
            document.getElementById('archiveDetailReview').textContent = wine.archiveNotes;
        } else {
            reviewSection.style.display = 'none';
        }

        // Archive date
        const dateEl = document.getElementById('archiveDetailDate');
        if (wine.archivedAt) {
            const date = new Date(wine.archivedAt);
            dateEl.textContent = `Gearchiveerd op ${date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`;
        } else {
            dateEl.textContent = '';
        }

        this.openModal('archiveDetailModal');
    }

    async restoreWineFromArchive() {
        const archivedWine = this.archive.find(w => w.id === this.currentArchiveId);
        if (!archivedWine) return;

        // Create a new wine entry (without archive-specific fields)
        const restoredWine = {
            id: Date.now().toString(), // New ID
            name: archivedWine.name,
            producer: archivedWine.producer,
            type: archivedWine.type,
            year: archivedWine.year,
            region: archivedWine.region,
            grape: archivedWine.grape,
            boldness: archivedWine.boldness,
            tannins: archivedWine.tannins,
            acidity: archivedWine.acidity,
            price: archivedWine.price,
            quantity: 1,
            store: archivedWine.store,
            notes: archivedWine.notes,
            image: archivedWine.image,
            addedAt: new Date().toISOString()
        };

        // Add to wines
        this.wines.unshift(restoredWine);
        this.saveToLocalStorage();

        if (this.firebaseEnabled) {
            await this.pushWineToFirebase(restoredWine);
        }

        // Remove from archive
        await this.deleteFromArchive(this.currentArchiveId);

        this.renderWineList();
        this.updateStats();
        this.filterAndRenderArchive();

        this.closeModal('archiveDetailModal');
        this.showToast('Wijn teruggezet naar kelder!');
    }

    async deleteFromArchiveConfirm() {
        if (!confirm('Weet je zeker dat je deze wijn definitief wilt verwijderen uit het archief?')) {
            return;
        }

        await this.deleteFromArchive(this.currentArchiveId);
        this.filterAndRenderArchive();

        this.closeModal('archiveDetailModal');
        this.showToast('Wijn verwijderd uit archief');
    }

    // ============================
    // Utilities
    // ============================

    showToast(message) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');

        toastMessage.textContent = message;
        toast.classList.add('show');

        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.wineCellar = new WineCellar();
});
