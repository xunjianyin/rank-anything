// Rank-Anything Web Application v2.0 with User Authentication
// Set your backend API URL here:
const BACKEND_URL = 'https://rank-anything.onrender.com';
const API_BASE = BACKEND_URL + '/api';
console.log('Rank-Anything v2.0 - Script loaded successfully');

// Application state
let currentPage = 'home';
let currentTopicId = null;
let currentObjectId = null;
let selectedRating = 0;
let lastSearchQuery = '';
let currentSearchResults = null;
let currentUser = null;
let editingReview = null;
let pendingVerificationUserId = null;

// Data structure
let data = {
    users: {},
    topics: [],
    objects: {},
    ratings: {},
    proposals: {},
    dailyUsage: {}
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    loadData();
    checkUserSession();
    showHomePage();
    initializeStarRating();
    
    // Add a small delay to ensure DOM is fully ready
    setTimeout(() => {
        initializeAuthForms();
    }, 100);
});

// User Authentication
function initializeAuthForms() {
    console.log('Initializing auth forms...');
    
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (loginForm) {
        console.log('Login form found, adding event listener');
        loginForm.addEventListener('submit', handleLogin);
        
        // Also add Enter key support
        loginForm.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                performLogin();
            }
        });
    } else {
        console.error('Login form not found!');
    }
    
    if (registerForm) {
        console.log('Register form found, adding event listener');
        registerForm.addEventListener('submit', handleRegister);
        
        // Also add Enter key support
        registerForm.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                performRegister();
            }
        });
    } else {
        console.error('Register form not found!');
    }
}

// Direct button click handlers
async function performLogin() {
    console.log('Perform login called');
    
    const emailOrUsername = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!emailOrUsername || !password) {
        alert('Please enter both email/username and password');
        return;
    }
    
    try {
        const response = await fetch(BACKEND_URL + '/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: emailOrUsername, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            loginUser(result.user, result.token);
            closeAuthModal();
            showNotification('Welcome back, ' + result.user.username + '!');
        } else {
            if (result.requiresVerification) {
                // Show verification modal
                pendingVerificationUserId = result.userId;
                closeAuthModal();
                showVerificationModal();
                showNotification('Please verify your email before logging in.');
            } else {
                alert(result.error || 'Login failed');
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please check your connection and try again.');
    }
}

async function performRegister() {
    console.log('Perform register called');
    try {
        console.log('Step 1: Getting form elements');
        const usernameInput = document.getElementById('register-username');
        const emailInput = document.getElementById('register-email');
        const passwordInput = document.getElementById('register-password');
        const confirmPasswordInput = document.getElementById('register-password-confirm');
        if (!usernameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
            console.error('One or more form elements not found:', {
                username: !!usernameInput,
                email: !!emailInput,
                password: !!passwordInput,
                confirmPassword: !!confirmPasswordInput
            });
            alert('Form elements not found. Please refresh the page and try again.');
            return;
        }
        console.log('Step 2: Getting form values');
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        console.log('Registration data:', { username, email, passwordLength: password.length, confirmPasswordLength: confirmPassword.length });
        console.log('Step 3: Validating input');
        if (!username || !email || !password || !confirmPassword) {
            alert('Please fill in all fields');
            return;
        }
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        // Validate password requirements
        if (password.length < 8) {
            alert('Password must be at least 8 characters long');
            return;
        }
        
        const hasLetter = /[a-zA-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        
        if (!hasLetter || !hasNumber) {
            alert('Password must contain both letters and numbers');
            return;
        }
        
        console.log('Step 4: Making API call to register');
        const response = await fetch(BACKEND_URL + '/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('Step 5: Registration successful');
            if (result.requiresVerification) {
                // Show verification modal
                pendingVerificationUserId = result.registrationId;
                closeAuthModal();
                showVerificationModal();
                showNotification('Registration successful! Please check your email for verification code.');
            } else if (result.emailServiceDown) {
                // Email service is down, but registration completed
                loginUser(result.user, result.token);
                closeAuthModal();
                showNotification('Registration successful! Email verification is temporarily unavailable, but you can use the app normally.');
            } else {
                // Direct login (shouldn't happen with new system)
                loginUser(result.user, result.token);
                closeAuthModal();
                showNotification('Registration successful! Welcome ' + username + '!');
            }
            console.log('Registration completed successfully');
        } else {
            // Check if it's a content filter error
            if (result.error && (result.error.includes('sensitive content') || result.error.includes('inappropriate content'))) {
                alert('Content Filter Error: ' + result.error + '\n\nPlease choose a different username that does not contain inappropriate content.');
            } else {
                alert(result.error || 'Registration failed');
            }
        }
    } catch (error) {
        console.error('Registration error details:', error);
        console.error('Error stack:', error);
        // Check if it's a content filter error
        if (error.message.includes('sensitive content') || error.message.includes('inappropriate content')) {
            alert('Content Filter Error: ' + error.message + '\n\nPlease choose a different username that does not contain inappropriate content.');
        } else {
            alert('Registration failed with error: ' + error.message + '. Check console for details.');
        }
    }
}

function handleLogin(event) {
    console.log('Login form submitted');
    event.preventDefault();
    performLogin();
}

function handleRegister(event) {
    console.log('Register form submitted');
    event.preventDefault();
    performRegister();
}

// --- Session Management with JWT ---
function saveAuthToken(token) {
    localStorage.setItem('authToken', token);
}
function getAuthToken() {
    return localStorage.getItem('authToken');
}
function clearAuthToken() {
    localStorage.removeItem('authToken');
}

async function fetchCurrentUser() {
    const token = getAuthToken();
    if (!token) return null;
    try {
        const res = await fetch(BACKEND_URL + '/api/health', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
            // Optionally, implement a /me endpoint for user info
            return JSON.parse(atob(token.split('.')[1])); // decode JWT payload
        }
    } catch (e) {}
    return null;
}

function loginUser(user, token) {
    currentUser = user;
    saveAuthToken(token);
    resetDailyUsageIfNeeded();
    updateUserInterface();
    // No more localStorage.setItem('currentUser', ...)
}

function logout() {
    currentUser = null;
    clearAuthToken();
    updateUserInterface();
    showHomePage();
}

// Fix: Only decode JWT if present and valid
async function checkUserSession() {
    const token = getAuthToken();
    console.log('Checking user session, token:', token ? 'present' : 'missing');
    
    if (token && token.split('.').length === 3) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            console.log('Token payload:', payload);
            
            // Check if token is expired
            if (payload.exp && payload.exp < Date.now() / 1000) {
                console.log('Token expired');
                clearAuthToken();
                currentUser = null;
                updateUserInterface();
                return;
            }
            
            currentUser = payload;
            console.log('Current user set:', currentUser);
            resetDailyUsageIfNeeded();
            updateUserInterface();
        } catch (e) {
            console.error('Error parsing token:', e);
            clearAuthToken();
            currentUser = null;
            updateUserInterface();
        }
    } else {
        console.log('No valid token found');
        currentUser = null;
        updateUserInterface();
    }
}

function updateUserInterface() {
    const userInfo = document.getElementById('user-info');
    const authButtons = document.getElementById('auth-buttons');
    const addTopicBtn = document.getElementById('add-topic-btn');
    const addObjectBtn = document.getElementById('add-object-btn');
    const submitRatingBtn = document.getElementById('submit-rating-btn');
    
    if (currentUser) {
        userInfo.style.display = 'flex';
        authButtons.style.display = 'none';
        
        document.getElementById('username-display').textContent = currentUser.username;
        // Admin badge and admin panel link
        const adminBadge = document.getElementById('admin-badge');
        const adminPanelLink = document.getElementById('admin-panel-link');
        if (currentUser.isAdmin) {
            if (adminBadge) adminBadge.style.display = '';
            if (adminPanelLink) adminPanelLink.style.display = '';
        } else {
            if (adminBadge) adminBadge.style.display = 'none';
            if (adminPanelLink) adminPanelLink.style.display = 'none';
        }
        updateDailyLimitsDisplay();
        updateProposalCount();
        
        // Enable/disable buttons based on daily limits (admins have no limits)
        const usage = getCurrentDailyUsage();
        console.log('Daily usage:', usage);
        if (addTopicBtn) {
            addTopicBtn.disabled = currentUser.isAdmin ? false : usage.topics >= 4;
            console.log('Add topic button disabled:', addTopicBtn.disabled, 'usage.topics:', usage.topics, 'isAdmin:', currentUser.isAdmin);
        }
        if (addObjectBtn) addObjectBtn.disabled = currentUser.isAdmin ? false : usage.objects >= 32;
        if (submitRatingBtn) submitRatingBtn.disabled = currentUser.isAdmin ? false : usage.ratings >= 64;
        // Re-bind dropdown events after UI update
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown) dropdown.onclick = function(e) { e.stopPropagation(); };
        const userProfile = document.querySelector('.user-profile');
        if (userProfile) {
            console.log('[DEBUG] userProfile found, binding click');
            userProfile.onclick = function(e) { console.log('[DEBUG] userProfile clicked'); toggleUserMenu(e); };
        } else {
            console.log('[DEBUG] userProfile NOT found');
        }
    } else {
        console.log('No current user, disabling buttons');
        userInfo.style.display = 'none';
        authButtons.style.display = 'flex';
        
        // Disable all creation buttons for non-logged users
        if (addTopicBtn) {
            addTopicBtn.disabled = true;
            console.log('Add topic button disabled (no user)');
        }
        if (addObjectBtn) addObjectBtn.disabled = true;
        if (submitRatingBtn) submitRatingBtn.disabled = true;
        // Hide admin badge and link
        const adminBadge = document.getElementById('admin-badge');
        const adminPanelLink = document.getElementById('admin-panel-link');
        if (adminBadge) adminBadge.style.display = 'none';
        if (adminPanelLink) adminPanelLink.style.display = 'none';
    }
}

// Daily usage tracking
function resetDailyUsageIfNeeded() {
    if (!currentUser) return;
    
    const today = new Date().toDateString();
    const userUsage = data.dailyUsage[currentUser.id]; // Changed from currentUser.username
    
    if (!userUsage || userUsage.date !== today) {
        data.dailyUsage[currentUser.id] = { // Changed from currentUser.username
            date: today,
            topics: 0,
            objects: 0,
            ratings: 0
        };
        saveData();
    }
}

function getCurrentDailyUsage() {
    if (!currentUser) return { topics: 0, objects: 0, ratings: 0 };
    return data.dailyUsage[currentUser.id] || { topics: 0, objects: 0, ratings: 0 }; // Changed from currentUser.username
}

function incrementDailyUsage(type) {
    if (!currentUser) return false;
    
    // Administrators have no daily limits
    if (currentUser.isAdmin) {
        return true;
    }
    
    const usage = getCurrentDailyUsage();
    const limits = { topics: 4, objects: 32, ratings: 64 };
    
    if (usage[type] >= limits[type]) {
        alert(`Daily limit reached! You can only create ${limits[type]} ${type} per day.`);
        return false;
    }
    
    usage[type]++;
    data.dailyUsage[currentUser.id] = usage; // Changed from currentUser.username
    saveData();
    updateDailyLimitsDisplay();
    updateUserInterface();
    return true;
}

function updateDailyLimitsDisplay() {
    if (!currentUser) return;
    
    const usage = getCurrentDailyUsage();
    const display = document.getElementById('daily-limits-display');
    
    if (currentUser.isAdmin) {
        display.textContent = `Today: ${usage.topics} topics, ${usage.objects} objects, ${usage.ratings} ratings (Admin - No Limits)`;
    } else {
        display.textContent = `Today: ${usage.topics}/4 topics, ${usage.objects}/32 objects, ${usage.ratings}/64 ratings`;
    }
}

// Modal functions
function showLoginModal() {
    console.log('Showing login modal');
    document.getElementById('auth-modal-title').textContent = 'Login';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('auth-modal').style.display = 'flex';
}

function showRegisterModal() {
    console.log('Showing register modal');
    document.getElementById('auth-modal-title').textContent = 'Register';
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-modal').style.display = 'flex';
}

function switchToRegister() {
    showRegisterModal();
}

function switchToLogin() {
    showLoginModal();
}

function closeAuthModal() {
    console.log('Closing auth modal');
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    // Clear forms if they exist
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
}

// Email Verification Functions
function showVerificationModal() {
    const modal = document.getElementById('verification-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeVerificationModal() {
    const modal = document.getElementById('verification-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Clear form fields
    const verificationForm = document.getElementById('verification-form');
    if (verificationForm) verificationForm.reset();
    
    pendingVerificationUserId = null;
}

async function handleEmailVerification(event) {
    event.preventDefault();
    
    const verificationCode = document.getElementById('verification-code').value.trim();
    
    if (!verificationCode) {
        alert('Please enter the verification code');
        return;
    }
    
    if (!pendingVerificationUserId) {
        alert('No pending verification. Please register again.');
        closeVerificationModal();
        return;
    }
    
    try {
        const response = await fetch(BACKEND_URL + '/api/verify-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                registrationId: pendingVerificationUserId, 
                verificationCode: verificationCode 
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            loginUser(result.user, result.token);
            closeVerificationModal();
            showNotification('Email verified successfully! Welcome to Rank-Anything!');
        } else {
            alert(result.error || 'Verification failed');
        }
    } catch (error) {
        console.error('Verification error:', error);
        alert('Verification failed. Please check your connection and try again.');
    }
}

async function resendVerificationCode() {
    if (!pendingVerificationUserId) {
        alert('No pending verification. Please register again.');
        closeVerificationModal();
        return;
    }
    
    const resendBtn = document.getElementById('resend-verification-btn');
    const originalText = resendBtn.textContent;
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending...';
    
    try {
        const response = await fetch(BACKEND_URL + '/api/resend-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ registrationId: pendingVerificationUserId })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Verification code sent successfully!');
        } else {
            alert(result.error || 'Failed to resend verification code');
        }
    } catch (error) {
        console.error('Resend verification error:', error);
        alert('Failed to resend verification code. Please check your connection and try again.');
    } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = originalText;
    }
}

function toggleUserMenu(event) {
    console.log('[DEBUG] toggleUserMenu called');
    event && event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        console.log('[DEBUG] Dropdown closed');
    } else {
        dropdown.style.display = 'block';
        console.log('[DEBUG] Dropdown opened');
    }
}

// Close dropdown when clicking outside
// Remove previous document click handler and add a more robust one
if (window._userDropdownHandler) {
    document.removeEventListener('click', window._userDropdownHandler);
}
window._userDropdownHandler = function(event) {
    const userProfile = document.querySelector('.user-profile');
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown || !userProfile) return;
    if (!userProfile.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.style.display = 'none';
    }
};
document.addEventListener('click', window._userDropdownHandler);
// Prevent dropdown from closing when clicking inside
const dropdown = document.getElementById('user-dropdown');
if (dropdown) {
    dropdown.onclick = function(e) { e.stopPropagation(); };
}
const userProfile = document.querySelector('.user-profile');
if (userProfile) {
    userProfile.onclick = function(e) { toggleUserMenu(e); };
}

// Data persistence functions
function saveData() {
    try {
        localStorage.setItem('rankAnythingData', JSON.stringify(data));
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

function loadData() {
    try {
        const savedData = localStorage.getItem('rankAnythingData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            
            // Only keep dailyUsage for now, since we still need it for local tracking
            data = {
                users: {},
                topics: [],
                objects: {},
                ratings: {},
                proposals: {},
                dailyUsage: parsedData.dailyUsage || {},
            };
            
            console.log('Local data loaded successfully (dailyUsage only):', data);
        } else {
            console.log('No saved data found, using default structure');
            data = {
                users: {},
                topics: [],
                objects: {},
                ratings: {},
                proposals: {},
                dailyUsage: {}
            };
        }
    } catch (error) {
        console.error('Error loading data:', error);
        // Reset to default structure if there's an error
        data = {
            users: {},
            topics: [],
            objects: {},
            ratings: {},
            proposals: {},
            dailyUsage: {}
        };
    }
}

// Note: Admin users are now managed through the backend database

// Navigation functions
function showHomePage() {
    currentPage = 'home';
    currentTopicId = null;
    currentObjectId = null;
    
    hideAllPages();
    document.getElementById('home-page').classList.add('active');
    updateBreadcrumb();
    renderTopics();
    clearSearch();
}

async function showTopicPage(topicId) {
    currentPage = 'topic';
    currentTopicId = topicId;
    currentObjectId = null;
    
    hideAllPages();
    document.getElementById('topic-page').classList.add('active');
    
    try {
        const topic = await fetchTopic(topicId);
        if (!topic) {
            document.getElementById('topic-title').textContent = 'Topic not found';
            return;
        }
        
        document.getElementById('topic-title').textContent = topic.name;
        
        // Add creator information to the topic header if not already present
        const topicHeaderContent = document.querySelector('.topic-header-content');
        let creatorInfo = topicHeaderContent.querySelector('.topic-creator-info');
        if (!creatorInfo) {
            creatorInfo = document.createElement('div');
            creatorInfo.className = 'topic-creator-info';
            creatorInfo.style.marginTop = '0.5rem';
            topicHeaderContent.insertBefore(creatorInfo, topicHeaderContent.querySelector('.topic-tags-display'));
        }
        
        // Render creator information
        const editorsDisplay = await renderEditorsDisplay('topic', topic.id, topic.creator_username || '', topic.creator_id);
        creatorInfo.innerHTML = `<small style="color: #666;">${editorsDisplay}</small>`;
        
        // Display topic tags
        await renderTopicTags();
        
        // Show edit/delete buttons if user owns the topic
        updateTopicActions(topic);
        
        await updateBreadcrumb();
        await renderObjects();
        clearSearch();
    } catch (error) {
        console.error('Error loading topic:', error);
        document.getElementById('topic-title').textContent = 'Error loading topic';
    }
}

async function showObjectPage(objectId) {
    currentPage = 'object';
    currentObjectId = objectId;
    
    hideAllPages();
    document.getElementById('object-page').classList.add('active');
    
    try {
        const object = await fetchObject(objectId);
        if (!object) {
            document.getElementById('object-title').textContent = 'Object not found';
            return;
        }
        
        // Set the current topic ID from the object data
        currentTopicId = object.topic_id;
        
        document.getElementById('object-title').textContent = object.name;
        
        // Show edit/delete buttons if user owns the object
        updateObjectActions(object);
        
        updateBreadcrumb();
        await renderObjectDetails();
        await renderReviews();
        await loadMyRating();
        resetRatingForm();
        clearSearch();
    } catch (error) {
        console.error('Error loading object:', error);
        document.getElementById('object-title').textContent = 'Error loading object';
    }
}

async function showSearchPage(query, searchType = 'all', tagFilters = null, tagLogic = 'and') {
    currentPage = 'search';
    lastSearchQuery = query;
    
    hideAllPages();
    document.getElementById('search-page').classList.add('active');
    
    updateBreadcrumb();
    
    // Show loading message
    const searchTitle = document.getElementById('search-title');
    const searchInfo = document.getElementById('search-info');
    searchTitle.textContent = 'Searching...';
    searchInfo.textContent = 'Please wait while we search for results.';
    
    await performSearchOperation(query, searchType, tagFilters, tagLogic);
}

function showProposalsPage() {
    currentPage = 'proposals';
    
    hideAllPages();
    document.getElementById('proposals-page').classList.add('active');
    
    updateBreadcrumb();
    document.renderProposals();
    toggleUserMenu(); // Close the dropdown
}

function showIntroductionPage() {
    currentPage = 'introduction';
    
    hideAllPages();
    document.getElementById('introduction-page').classList.add('active');
    
    updateBreadcrumb();
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
}

async function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = '';
    
    if (currentPage === 'home') {
        html = 'Topics';
    } else if (currentPage === 'topic') {
        try {
            const topic = await fetchTopic(currentTopicId);
            html = `<a href="#" onclick="showHomePage()">Topics</a> > ${topic ? escapeHtml(topic.name) : 'Topic'}`;
        } catch (error) {
            html = `<a href="#" onclick="showHomePage()">Topics</a> > Topic`;
        }
    } else if (currentPage === 'object') {
        try {
            const topic = await fetchTopic(currentTopicId);
            const object = await fetchObject(currentObjectId);
            const topicName = topic ? escapeHtml(topic.name) : 'Topic';
            const objectName = object ? escapeHtml(object.name) : 'Object';
            html = `<a href="#" onclick="showHomePage()">Topics</a> > <a href="#" onclick="showTopicPage('${currentTopicId}')">${topicName}</a> > ${objectName}`;
        } catch (error) {
            html = `<a href="#" onclick="showHomePage()">Topics</a> > Topic > Object`;
        }
    } else if (currentPage === 'search') {
        html = `<a href="#" onclick="showHomePage()">Topics</a> > Search Results`;
    } else if (currentPage === 'proposals') {
        html = `<a href="#" onclick="showHomePage()">Topics</a> > Pending Proposals`;
    } else if (currentPage === 'introduction') {
        html = `<a href="#" onclick="showHomePage()">Topics</a> > 关于本站`;
    }
    
    breadcrumb.innerHTML = html;
}

// Ownership and permissions
function updateTopicActions(topic) {
    const editBtn = document.getElementById('edit-topic-btn');
    const deleteBtn = document.getElementById('delete-topic-btn');
    // Remove any previous propose buttons
    const proposeEditBtnId = 'propose-edit-topic-btn';
    const proposeDeleteBtnId = 'propose-delete-topic-btn';
    let proposeEditBtn = document.getElementById(proposeEditBtnId);
    let proposeDeleteBtn = document.getElementById(proposeDeleteBtnId);
    if (proposeEditBtn) proposeEditBtn.remove();
    if (proposeDeleteBtn) proposeDeleteBtn.remove();
    // Show edit/delete for owner or admin
    if (currentUser && (currentUser.isAdmin || topic.creator_id === currentUser.id)) {
        editBtn.style.display = 'inline-flex';
        deleteBtn.style.display = 'inline-flex';
    } else {
        editBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        // Show propose buttons for logged-in users who are not owner or admin
        if (currentUser) {
            // Insert after editBtn and deleteBtn
            proposeEditBtn = document.createElement('button');
            proposeEditBtn.id = proposeEditBtnId;
            proposeEditBtn.className = 'btn btn-small btn-secondary';
            proposeEditBtn.textContent = 'Propose Edit';
            proposeEditBtn.onclick = async function() {
                const newName = prompt('Enter new topic name:', topic.name);
                if (!newName || newName.trim() === '') return;
                
                const currentTags = await fetchTopicTags(topic.id);
                const currentTagNames = currentTags.map(tag => tag.name);
                const newTagsStr = prompt('Enter tags (comma-separated):', currentTagNames.join(', '));
                if (newTagsStr === null) return;
                
                const newTags = parseAndCleanTags(newTagsStr);
                
                if (newName.trim() === topic.name && JSON.stringify(newTags) === JSON.stringify(currentTagNames)) return;
                
                try {
                    await createProposal('edit', 'topic', topic.id, JSON.stringify({ name: newName.trim(), tags: newTags }), 'User proposed topic edit');
                    showNotification('Edit proposal submitted for community voting');
                    updateProposalCount();
                } catch (error) {
                    alert('Failed to create proposal: ' + error.message);
                }
            };
            editBtn.parentNode.insertBefore(proposeEditBtn, editBtn.nextSibling);
            proposeDeleteBtn = document.createElement('button');
            proposeDeleteBtn.id = proposeDeleteBtnId;
            proposeDeleteBtn.className = 'btn btn-small btn-danger';
            proposeDeleteBtn.textContent = 'Propose Delete';
            proposeDeleteBtn.onclick = async function() {
                if (!confirm('Are you sure you want to propose deletion of this topic?')) return;
                try {
                    await createProposal('delete', 'topic', topic.id, null, 'User proposed topic deletion');
                    showNotification('Deletion proposal submitted for community voting');
                    updateProposalCount();
                } catch (error) {
                    alert('Failed to create proposal: ' + error.message);
                }
            };
            deleteBtn.parentNode.insertBefore(proposeDeleteBtn, deleteBtn.nextSibling);
        }
    }
}

function updateObjectActions(object) {
    const editBtn = document.getElementById('edit-object-btn');
    const deleteBtn = document.getElementById('delete-object-btn');
    // Remove any previous propose buttons
    const proposeEditBtnId = 'propose-edit-object-btn';
    const proposeDeleteBtnId = 'propose-delete-object-btn';
    let proposeEditBtn = document.getElementById(proposeEditBtnId);
    let proposeDeleteBtn = document.getElementById(proposeDeleteBtnId);
    if (proposeEditBtn) proposeEditBtn.remove();
    if (proposeDeleteBtn) proposeDeleteBtn.remove();
    // Show edit/delete for owner or admin
    if (currentUser && (currentUser.isAdmin || object.creator_id === currentUser.id)) {
        editBtn.style.display = 'inline-flex';
        deleteBtn.style.display = 'inline-flex';
    } else {
        editBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
        // Show propose buttons for logged-in users who are not owner or admin
        if (currentUser) {
            proposeEditBtn = document.createElement('button');
            proposeEditBtn.id = proposeEditBtnId;
            proposeEditBtn.className = 'btn btn-small btn-secondary';
            proposeEditBtn.textContent = 'Propose Edit';
            proposeEditBtn.onclick = async function() {
                const newName = prompt('Enter new object name:', object.name);
                if (!newName || newName.trim() === '') return;
                const currentTags = await fetchObjectTags(object.id);
                const currentTagNames = currentTags.map(tag => tag.name);
                const newTagsStr = prompt('Enter tags (comma-separated):', currentTagNames.join(', '));
                if (newTagsStr === null) return;
                const newTags = parseAndCleanTags(newTagsStr);
                if (newName.trim() === object.name && JSON.stringify(newTags) === JSON.stringify(currentTagNames)) return;
                try {
                    await createProposal('edit', 'object', object.id, JSON.stringify({ name: newName.trim(), tags: newTags }), 'User proposed object edit');
                    showNotification('Edit proposal submitted for community voting');
                    updateProposalCount();
                } catch (error) {
                    alert('Failed to create proposal: ' + error.message);
                }
            };
            editBtn.parentNode.insertBefore(proposeEditBtn, editBtn.nextSibling);
            proposeDeleteBtn = document.createElement('button');
            proposeDeleteBtn.id = proposeDeleteBtnId;
            proposeDeleteBtn.className = 'btn btn-small btn-danger';
            proposeDeleteBtn.textContent = 'Propose Delete';
            proposeDeleteBtn.onclick = async function() {
                if (!confirm('Are you sure you want to propose deletion of this object?')) return;
                try {
                    await createProposal('delete', 'object', object.id, null, 'User proposed object deletion');
                    showNotification('Deletion proposal submitted for community voting');
                    updateProposalCount();
                } catch (error) {
                    alert('Failed to create proposal: ' + error.message);
                }
            };
            deleteBtn.parentNode.insertBefore(proposeDeleteBtn, deleteBtn.nextSibling);
        }
    }
}

// Search functionality
function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        performSearch();
    }
}

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;
    
    await showSearchPage(query);
}

function toggleAdvancedSearch() {
    const panel = document.getElementById('advanced-search-panel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
}

async function performAdvancedSearch() {
    const query = document.getElementById('search-input').value.trim();
    const searchType = document.getElementById('search-type').value;
    const tagInput = document.getElementById('tag-search-input').value.trim();
    const tagLogic = document.getElementById('tag-search-logic').value;
    
    let tagFilters = null;
    if (tagInput) {
        tagFilters = parseAndCleanTags(tagInput);
    }
    
    if (!query && !tagFilters) {
        alert('Please enter a search term or tag filters');
        return;
    }
    
    await showSearchPage(query, searchType, tagFilters, tagLogic);
    toggleAdvancedSearch(); // Hide the panel after search
}

function clearAdvancedSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-type').value = 'all';
    document.getElementById('tag-search-input').value = '';
    document.getElementById('tag-search-logic').value = 'and';
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('advanced-search-panel').style.display = 'none';
    clearAdvancedSearch();
}

async function performSearchOperation(query, searchType, tagFilters, tagLogic) {
    const results = {
        topics: [],
        objects: []
    };
    
    try {
        // Search topics
        if (searchType === 'all' || searchType === 'topics') {
            results.topics = await searchTopics(query, tagFilters, tagLogic);
        }
        
        // Search objects
        if (searchType === 'all' || searchType === 'objects') {
            results.objects = await searchObjects(query, tagFilters, tagLogic);
        }
        
        currentSearchResults = results;
        renderSearchResults(query, searchType, tagFilters, tagLogic);
    } catch (error) {
        console.error('Search error:', error);
        currentSearchResults = { topics: [], objects: [] };
        renderSearchResults(query, searchType, tagFilters, tagLogic);
    }
}

async function searchTopics(query, tagFilters, tagLogic) {
    try {
        const topics = await fetchTopics();
        const results = [];
        
        for (const topic of topics) {
            let matches = true;
            
            // Text search in topic name
            if (query && !topic.name.toLowerCase().includes(query.toLowerCase())) {
                matches = false;
            }
            
            // Tag filters - search in topic tags and objects within topics
            if (matches && tagFilters && tagFilters.length > 0) {
                // Check topic tags first
                const topicTags = await fetchTopicTags(topic.id);
                const topicTagNames = topicTags.map(tag => tag.name);
                const topicMatches = matchesTags(topicTagNames, tagFilters, tagLogic);
                
                if (!topicMatches) {
                    // If topic tags don't match, check objects within the topic
                    try {
                        const topicObjects = await fetchObjects(topic.id);
                        const hasMatchingObjects = await Promise.all(
                            topicObjects.map(async (object) => {
                                const objectTags = await fetchObjectTags(object.id);
                                const objectTagNames = objectTags.map(tag => tag.name);
                                return matchesTags(objectTagNames, tagFilters, tagLogic);
                            })
                        );
                        matches = hasMatchingObjects.some(match => match);
                    } catch (error) {
                        console.error(`Error fetching objects for topic ${topic.id}:`, error);
                        matches = false;
                    }
                } else {
                    matches = true;
                }
            }
            
            if (matches) {
                results.push(topic);
            }
        }
        
        return results;
    } catch (error) {
        console.error('Error searching topics:', error);
        return [];
    }
}

async function searchObjects(query, tagFilters, tagLogic) {
    try {
        const topics = await fetchTopics();
        const results = [];
        
        for (const topic of topics) {
            try {
                const topicObjects = await fetchObjects(topic.id);
                
                for (const object of topicObjects) {
                    let matches = true;
                    
                    // Text search in object name
                    if (query) {
                        const searchText = query.toLowerCase();
                        let objectMatches = object.name.toLowerCase().includes(searchText);
                        
                        // Also search in object tags
                        if (!objectMatches) {
                            try {
                                const objectTags = await fetchObjectTags(object.id);
                                const objectTagNames = objectTags.map(tag => tag.name);
                                objectMatches = objectTagNames.some(tag => 
                                    tag.toLowerCase().includes(searchText)
                                );
                            } catch (error) {
                                console.error(`Error fetching tags for object ${object.id}:`, error);
                            }
                        }
                        
                        if (!objectMatches) {
                            matches = false;
                        }
                    }
                    
                    // Tag filters
                    if (matches && tagFilters && tagFilters.length > 0) {
                        try {
                            const objectTags = await fetchObjectTags(object.id);
                            const objectTagNames = objectTags.map(tag => tag.name);
                            matches = matchesTags(objectTagNames, tagFilters, tagLogic);
                        } catch (error) {
                            console.error(`Error fetching tags for object ${object.id}:`, error);
                            matches = false;
                        }
                    }
                    
                    if (matches) {
                        results.push({
                            ...object,
                            topicId: topic.id,
                            topicName: topic.name
                        });
                    }
                }
            } catch (error) {
                console.error(`Error fetching objects for topic ${topic.id}:`, error);
            }
        }
        
        return results;
    } catch (error) {
        console.error('Error searching objects:', error);
        return [];
    }
}

function matchesTags(objectTags, tagFilters, tagLogic) {
    const objectTagsLower = objectTags.map(tag => tag.toLowerCase());
    const filterTagsLower = tagFilters.map(tag => tag.toLowerCase());
    
    if (tagLogic === 'and') {
        // Object must have ALL specified tags
        return filterTagsLower.every(filterTag =>
            objectTagsLower.some(objectTag => objectTag.includes(filterTag))
        );
    } else {
        // Object must have ANY of the specified tags
        return filterTagsLower.some(filterTag =>
            objectTagsLower.some(objectTag => objectTag.includes(filterTag))
        );
    }
}

async function renderSearchResults(query, searchType, tagFilters, tagLogic) {
    const searchTitle = document.getElementById('search-title');
    const searchInfo = document.getElementById('search-info');
    const topicsSection = document.getElementById('topics-results-section');
    const objectsSection = document.getElementById('objects-results-section');
    const noResults = document.getElementById('no-search-results');
    
    // Update title and info
    searchTitle.textContent = 'Search Results';
    
    let infoText = '';
    if (query && tagFilters) {
        infoText = `Searching for "${query}" with tag filters: ${tagFilters.join(', ')} (${tagLogic.toUpperCase()})`;
    } else if (query) {
        infoText = `Searching for "${query}"`;
    } else if (tagFilters) {
        infoText = `Filtered by tags: ${tagFilters.join(', ')} (${tagLogic.toUpperCase()})`;
    }
    
    if (searchType !== 'all') {
        infoText += ` in ${searchType}`;
    }
    
    searchInfo.textContent = infoText;
    
    // Hide all sections initially
    topicsSection.style.display = 'none';
    objectsSection.style.display = 'none';
    noResults.style.display = 'none';
    
    let hasResults = false;
    
    // Render topics results
    if (currentSearchResults.topics.length > 0) {
        hasResults = true;
        topicsSection.style.display = 'block';
        await renderSearchTopics();
    }
    
    // Render objects results
    if (currentSearchResults.objects.length > 0) {
        hasResults = true;
        objectsSection.style.display = 'block';
        await renderSearchObjects();
    }
    
    // Show no results message if needed
    if (!hasResults) {
        noResults.style.display = 'block';
    }
}

async function renderSearchTopics() {
    const grid = document.getElementById('search-topics-grid');
    
    try {
        const topicsWithCounts = await Promise.all(
            currentSearchResults.topics.map(async (topic) => {
                try {
                    const objects = await fetchObjects(topic.id);
                    return { ...topic, objectCount: objects.length };
                } catch (error) {
                    console.error(`Error fetching objects for topic ${topic.id}:`, error);
                    return { ...topic, objectCount: 0 };
                }
            })
        );
        
        // Render search topics with editors display
        const topicCards = await Promise.all(topicsWithCounts.map(async (topic) => {
            const editorsDisplay = await renderEditorsDisplay('topic', topic.id, topic.creator_username || '', topic.creator_id);
            return `
                <div class="topic-card" onclick="showTopicPage('${topic.id}')">
                    <div class="card-owner">${editorsDisplay}</div>
                    <h3>${escapeHtml(topic.name)}</h3>
                    <p class="rating-text">${topic.objectCount} item${topic.objectCount !== 1 ? 's' : ''}</p>
                </div>
            `;
        }));
        
        grid.innerHTML = topicCards.join('');
    } catch (error) {
        console.error('Error rendering search topics:', error);
        grid.innerHTML = '<div class="error">Failed to load topic results</div>';
    }
}

async function renderSearchObjects() {
    const grid = document.getElementById('search-objects-grid');
    
    try {
        const objectsWithDetails = await Promise.all(
            currentSearchResults.objects.map(async (object) => {
                try {
                    // Fetch ratings and tags for each object
                    const [ratings, tags] = await Promise.all([
                        fetchRatings(object.id),
                        fetchObjectTags(object.id)
                    ]);
                    
                    const averageRating = calculateAverageRating(ratings);
                    const ratingCount = ratings.length;
                    const tagNames = tags.map(tag => tag.name);
                    
                    return {
                        ...object,
                        averageRating,
                        ratingCount,
                        tags: tagNames
                    };
                } catch (error) {
                    console.error(`Error fetching details for object ${object.id}:`, error);
                    return {
                        ...object,
                        averageRating: 0,
                        ratingCount: 0,
                        tags: []
                    };
                }
            })
        );
        
        // Render search objects with editors display
        const objectCards = await Promise.all(objectsWithDetails.map(async (object) => {
            const editorsDisplay = await renderEditorsDisplay('object', object.id, object.creator_username || '', object.creator_id);
            return `
                <div class="object-card" onclick="showObjectFromSearch('${object.topicId}', '${object.id}')">
                    <div class="card-owner">${editorsDisplay}</div>
                    <div class="topic-context">From: ${escapeHtml(object.topicName)}</div>
                    <h3>${escapeHtml(object.name)}</h3>
                    ${object.averageRating > 0 ? `
                        <div class="rating">
                            <span class="stars">${renderStars(object.averageRating)}</span>
                            <span class="rating-text">${object.averageRating.toFixed(1)} (${object.ratingCount} review${object.ratingCount !== 1 ? 's' : ''})</span>
                        </div>
                    ` : `
                        <div class="rating">
                            <span class="rating-text">No ratings yet</span>
                        </div>
                    `}
                    ${object.tags.length > 0 ? `
                        <div class="tags">
                            ${object.tags.map(tag => `<span class="tag clickable" onclick="searchByTag('${escapeHtml(tag)}', event)">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }));
        
        grid.innerHTML = objectCards.join('');
    } catch (error) {
        console.error('Error rendering search objects:', error);
        grid.innerHTML = '<div class="error">Failed to load object results</div>';
    }
}

async function showObjectFromSearch(topicId, objectId) {
    currentTopicId = topicId;
    await showObjectPage(objectId);
}

async function searchByTag(tag, event) {
    if (event) {
        event.stopPropagation(); // Prevent card click
    }
    
    // Clear search input and set tag filter
    document.getElementById('search-input').value = '';
    document.getElementById('tag-search-input').value = tag;
    document.getElementById('tag-search-logic').value = 'or';
    document.getElementById('search-type').value = 'all';
    
    // Show advanced search panel
    document.getElementById('advanced-search-panel').style.display = 'block';
    
    // Perform search
    await showSearchPage('', 'all', [tag], 'or');
}

// --- Topic Management with Backend API ---
async function fetchTopics() {
    const res = await fetch(BACKEND_URL + '/api/topics');
    if (!res.ok) throw new Error('Failed to fetch topics');
    const data = await res.json();
    
    // Handle both old and new API response formats
    if (data.topics) {
        // New paginated format
        return data.topics;
    } else if (Array.isArray(data)) {
        // Old format - return as is for backward compatibility
        return data;
    } else {
        // Fallback
        return [];
    }
}

async function createTopic(name, tags) {
    const token = getAuthToken();
    console.log('Creating topic:', { name, tags, token: token ? 'present' : 'missing' });
    
    const res = await fetch(BACKEND_URL + '/api/topics', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, tags })
    });
    
    if (!res.ok) {
        const errorText = await res.text();
        console.error('Create topic error:', res.status, errorText);
        throw new Error(`Failed to create topic: ${res.status} ${errorText}`);
    }
    
    return await res.json();
}

async function updateTopic(id, name, tags) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + '/api/topics/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, tags })
    });
    if (!res.ok) throw new Error('Failed to update topic');
    return await res.json();
}

async function deleteTopic(id) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + '/api/topics/' + id, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    });
    if (!res.ok) throw new Error('Failed to delete topic');
    return await res.json();
}

// Replace renderTopics to use API
async function renderTopics() {
    const grid = document.getElementById('topics-grid');
    grid.innerHTML = '<div>Loading...</div>';
    try {
        const topics = await fetchTopics();
        if (topics.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <h3>No topics yet</h3>
                    <p>Create your first topic to start ranking!</p>
                </div>
            `;
            return;
        }
        
        // Render topics with editors display
        const topicCards = await Promise.all(topics.map(async (topic) => {
            const editorsDisplay = await renderEditorsDisplay('topic', topic.id, topic.creator_username || '', topic.creator_id);
            return `
                <div class="topic-card" onclick="showTopicPage('${topic.id}')">
                    <div class="card-owner">${editorsDisplay}</div>
                    <h3>${escapeHtml(topic.name)}</h3>
                    <p class="rating-text">Created: ${formatDate(topic.created_at)}</p>
                </div>
            `;
        }));
        
        grid.innerHTML = topicCards.join('');
    } catch (e) {
        grid.innerHTML = '<div class="error">Failed to load topics.</div>';
    }
}

// Replace addTopic to use API
async function addTopic(event) {
    event.preventDefault();
    console.log('addTopic called, currentUser:', currentUser);
    if (!currentUser) {
        alert('Please login to add topics');
        return;
    }
    
    // Check daily limits before proceeding (admins bypass this)
    if (!currentUser.isAdmin && !incrementDailyUsage('topics')) {
        return;
    }
    
    const topicName = document.getElementById('topic-name').value.trim();
    const topicTagsStr = document.getElementById('topic-tags').value.trim();
    if (!topicName) return;
    
    const tags = parseAndCleanTags(topicTagsStr);
    
    try {
        console.log('Attempting to create topic:', topicName, 'with tags:', tags);
        await createTopic(topicName, tags);
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        // Clear form
        document.getElementById('topic-name').value = '';
        document.getElementById('topic-tags').value = '';
        
        renderTopics();
        hideAddTopicForm();
        showNotification('Topic created!');
    } catch (e) {
        console.error('Error creating topic:', e);
        
        // Check if it's a content filter error
        if (e.message.includes('sensitive content') || e.message.includes('inappropriate content')) {
            alert('Content Filter Error: ' + e.message + '\n\nPlease revise your topic name or tags to remove any inappropriate content.');
        } else {
            alert('Failed to create topic: ' + e.message);
        }
        
        // Revert daily usage increment on failure (only for non-admins)
        if (!currentUser.isAdmin) {
            const usage = getCurrentDailyUsage();
            usage.topics = Math.max(0, usage.topics - 1);
            data.dailyUsage[currentUser.id] = usage;
            saveData();
            updateDailyLimitsDisplay();
            updateUserInterface();
        }
    }
}

// --- Object Management with Backend API ---
async function fetchObjects(topicId) {
    const res = await fetch(BACKEND_URL + `/api/topics/${topicId}/objects`);
    if (!res.ok) throw new Error('Failed to fetch objects');
    const data = await res.json();
    
    // Handle both old and new API response formats
    if (data.objects) {
        // New paginated format
        return data.objects;
    } else if (Array.isArray(data)) {
        // Old format - return as is for backward compatibility
        return data;
    } else {
        // Fallback
        return [];
    }
}

async function fetchObject(objectId) {
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}`);
    if (!res.ok) throw new Error('Failed to fetch object');
    return await res.json();
}

async function fetchTopic(topicId) {
    const res = await fetch(BACKEND_URL + `/api/topics/${topicId}`);
    if (!res.ok) throw new Error('Failed to fetch topic');
    return await res.json();
}

async function fetchTopicTags(topicId) {
    const res = await fetch(BACKEND_URL + `/api/topics/${topicId}/tags`);
    if (!res.ok) throw new Error('Failed to fetch topic tags');
    return await res.json();
}

async function createObject(topicId, name) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/topics/${topicId}/objects`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to create object');
    return await res.json();
}

async function updateObject(objectId, name) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to update object');
    return await res.json();
}

async function deleteObject(objectId) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + token
        }
    });
    if (!res.ok) throw new Error('Failed to delete object');
    return await res.json();
}

// Replace renderObjects to use API
async function renderObjects() {
    const grid = document.getElementById('objects-grid');
    grid.innerHTML = '<div>Loading...</div>';
    try {
        const objects = await fetchObjects(currentTopicId);
        if (objects.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-cube"></i>
                    <h3>No objects yet</h3>
                    <p>Add your first object to start rating!</p>
                </div>
            `;
            return;
        }
        // Fetch tags for each object and render
        const objectsWithTags = await Promise.all(objects.map(async (object) => {
            try {
                const tags = await fetchObjectTags(object.id);
                return { ...object, tags: tags.map(tag => tag.name) };
            } catch (error) {
                console.error(`Failed to fetch tags for object ${object.id}:`, error);
                return { ...object, tags: [] };
            }
        }));
        
        // Render objects with editors display
        const objectCards = await Promise.all(objectsWithTags.map(async (object) => {
            const editorsDisplay = await renderEditorsDisplay('object', object.id, object.creator_username || '', object.creator_id);
            return `
                <div class="object-card" onclick="showObjectPage('${object.id}')">
                    <div class="card-owner">${editorsDisplay}</div>
                    <h3>${escapeHtml(object.name)}</h3>
                    <div class="rating">
                        <span class="rating-text">Created: ${formatDate(object.created_at)}</span>
                    </div>
                    ${object.tags.length > 0 ? `
                        <div class="tags">
                            ${object.tags.map(tag => `<span class="tag clickable" onclick="searchByTag('${escapeHtml(tag)}', event)">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }));
        
        grid.innerHTML = objectCards.join('');
    } catch (e) {
        grid.innerHTML = '<div class="error">Failed to load objects.</div>';
    }
}

// Replace addObject to use API
async function addObject(event) {
    event.preventDefault();
    if (!currentUser) {
        alert('Please login to add objects');
        return;
    }
    
    // Check daily limits before proceeding (admins bypass this)
    if (!currentUser.isAdmin && !incrementDailyUsage('objects')) {
        return;
    }
    
    const objectName = document.getElementById('object-name').value.trim();
    const objectTagsStr = document.getElementById('object-tags').value.trim();
    if (!objectName) return;
    
    try {
        const newObject = await createObject(currentTopicId, objectName);
        
        // Add additional tags if specified (beyond inherited topic tags)
        if (objectTagsStr) {
            const additionalTags = parseAndCleanTags(objectTagsStr);
            if (additionalTags.length > 0) {
                // Get current tags (inherited from topic)
                const currentTags = await fetchObjectTags(newObject.id);
                const currentTagNames = currentTags.map(tag => tag.name);
                
                // Combine current tags with additional tags (remove duplicates)
                const allTags = [...new Set([...currentTagNames, ...additionalTags])];
                await assignTagsToObject(newObject.id, allTags);
            }
        }
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        renderObjects();
        hideAddObjectForm();
        showNotification('Object created!');
    } catch (e) {
        // Check if it's a content filter error
        if (e.message.includes('sensitive content') || e.message.includes('inappropriate content')) {
            alert('Content Filter Error: ' + e.message + '\n\nPlease revise your object name or tags to remove any inappropriate content.');
        } else {
            alert('Failed to create object: ' + e.message);
        }
        // Revert daily usage increment on failure (only for non-admins)
        if (!currentUser.isAdmin) {
            const usage = getCurrentDailyUsage();
            usage.objects = Math.max(0, usage.objects - 1);
            data.dailyUsage[currentUser.id] = usage;
            saveData();
            updateDailyLimitsDisplay();
            updateUserInterface();
        }
    }
}

// Object details and rating
async function renderObjectDetails() {
    try {
        const object = await fetchObject(currentObjectId);
        const ratings = await fetchRatings(currentObjectId);
        const averageRating = calculateAverageRating(ratings);
        const ratingCount = ratings.length;
        
        // Add creator information to the object header if not already present
        const objectHeader = document.querySelector('.object-header');
        let creatorInfo = objectHeader.querySelector('.object-creator-info');
        if (!creatorInfo) {
            creatorInfo = document.createElement('div');
            creatorInfo.className = 'object-creator-info';
            objectHeader.insertBefore(creatorInfo, objectHeader.querySelector('.object-actions'));
        }
        
        // Render creator information
        const editorsDisplay = await renderEditorsDisplay('object', object.id, object.creator_username || '', object.creator_id);
        creatorInfo.innerHTML = `<small style="color: #666; margin-left: 0.5rem;">${editorsDisplay}</small>`;
        
        // Render tags using the new API function
        await renderObjectTags();
        
        // Render rating summary
        const ratingSummary = document.getElementById('rating-summary');
        if (averageRating > 0) {
            ratingSummary.innerHTML = `
                <span class="stars">${renderStars(averageRating)}</span>
                <span class="rating-text">${averageRating.toFixed(1)} out of 5 (${ratingCount} review${ratingCount !== 1 ? 's' : ''})</span>
            `;
        } else {
            ratingSummary.innerHTML = `
                <span class="rating-text">No ratings yet - be the first to rate!</span>
            `;
        }
    } catch (error) {
        console.error('Error rendering object details:', error);
        const ratingSummary = document.getElementById('rating-summary');
        ratingSummary.innerHTML = '<span class="rating-text">Error loading object details</span>';
    }
}

// --- Ratings & Reviews with Backend API ---
async function fetchRatings(objectId) {
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}/ratings`);
    if (!res.ok) throw new Error('Failed to fetch ratings');
    const data = await res.json();
    return data.ratings || []; // Return the ratings array, or an empty array if undefined
}

async function submitRatingToAPI(objectId, rating, review) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}/ratings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ rating, review })
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to submit rating');
    }
    return await res.json();
}

async function fetchMyObjectRating(objectId) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}/my-rating`, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to fetch my rating');
    return await res.json();
}

async function loadMyRating() {
    if (!currentUser || !currentObjectId) return;
    
    try {
        const result = await fetchMyObjectRating(currentObjectId);
        if (result.rating) {
            // Pre-populate the form with existing rating
            selectedRating = result.rating.rating;
            document.getElementById('review-text').value = result.rating.review || '';
            document.getElementById('submit-rating-btn').textContent = 'Update Rating';
            updateStarDisplay();
        } else {
            // No existing rating
            resetRatingForm();
        }
    } catch (error) {
        console.error('Error loading my rating:', error);
        resetRatingForm();
    }
}

// Replace renderReviews to use API
async function renderReviews() {
    const reviewsList = document.getElementById('reviews-list');
    try {
        const ratingsData = await fetchRatings(currentObjectId); // fetchRatings returns the array directly
        if (!ratingsData || ratingsData.length === 0) {
            reviewsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment"></i>
                    <h3>No reviews yet</h3>
                    <p>Be the first to share your thoughts!</p>
                </div>
            `;
            return;
        }
        // Sort ratings by date (newest first)
        const sortedRatings = [...ratingsData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        reviewsList.innerHTML = sortedRatings.map((rating) => `
            <div class="review-item" id="review-${rating.id}">
                <div class="review-owner">by ${makeUsernameClickable(rating.username, rating.user_id)}</div>
                ${currentUser && rating.user_id === currentUser.id ? `
                    <div class="review-actions">
                        <button class="btn btn-small btn-secondary" onclick="editReview(${rating.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </div>
                ` : ''}
                <div class="review-header">
                    <span class="review-rating">${renderStars(rating.rating)}</span>
                    <span class="review-date">${formatDate(rating.created_at)}</span>
                </div>
                ${rating.review ? `<div class="review-text">${escapeHtml(rating.review)}</div>` : ''}
                ${rating.updated_at && rating.updated_at !== rating.created_at ? `<div class="review-edited-notice">(edited ${formatDate(rating.updated_at)})</div>` : ''}
            </div>
        `).join('');
    } catch (e) {
        reviewsList.innerHTML = '<div class="error">Failed to load reviews.</div>';
    }
}

// Replace submitRating to use API
async function submitRating() {
    if (!currentUser) {
        alert('Please login to submit ratings');
        return;
    }
    if (selectedRating === 0) {
        alert('Please select a rating');
        return;
    }
    
    const reviewText = document.getElementById('review-text').value.trim();
    const submitButton = document.getElementById('submit-rating-btn');
    const editingRatingId = submitButton.dataset.editingRatingId;

    try {
        let result;
        if (editingRatingId) {
            // This is an update to an existing rating
            result = await updateRatingAPI(editingRatingId, selectedRating, reviewText);
            showNotification('Rating updated successfully!');
        } else {
            // This is a new rating submission
            // Check daily limits before proceeding (admins bypass this)
            if (!currentUser.isAdmin && !incrementDailyUsage('ratings')) {
                 // incrementDailyUsage already shows an alert if limit is reached
                return; 
            }
            result = await submitRatingToAPI(currentObjectId, selectedRating, reviewText);
            showNotification('New rating submitted successfully!');
        }
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        await renderObjectDetails(); // Recalculates average, etc.
        await renderReviews();     // Re-renders the reviews list
        
        // Reset the form
        resetRatingForm(); // This will also clear editingRatingId from the button and reset its text

    } catch (e) {
        // Check if it's a content filter error
        if (e.message.includes('sensitive content') || e.message.includes('inappropriate content')) {
            alert('Content Filter Error: ' + e.message + '\n\nPlease revise your review text to remove any inappropriate content.');
        } else {
             alert('Failed to submit rating: ' + e.message);
        }
        // If it was a new rating attempt that failed due to non-limit reasons, and usage was incremented,
        // we might need to decrement it. However, incrementDailyUsage only returns false if limit reached.
        // Failures due to 24h cooldown or other errors won't have incremented the daily usage counter yet.
    }
}

// Star rating system
function initializeStarRating() {
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('click', function() {
            if (!currentUser) {
                alert('Please login to rate');
                return;
            }
            selectedRating = parseInt(this.dataset.rating);
            updateStarDisplay();
        });
        
        star.addEventListener('mouseenter', function() {
            const rating = parseInt(this.dataset.rating);
            highlightStars(rating);
        });
    });
    
    document.getElementById('star-rating').addEventListener('mouseleave', function() {
        updateStarDisplay();
    });
}

function highlightStars(rating) {
    const stars = document.querySelectorAll('.star');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
}

function updateStarDisplay() {
    highlightStars(selectedRating);
}

function resetRatingForm() {
    selectedRating = 0;
    updateStarDisplay();
    document.getElementById('review-text').value = '';
    const submitButton = document.getElementById('submit-rating-btn');
    submitButton.textContent = 'Submit Rating';
    delete submitButton.dataset.editingRatingId; // Clear editing state
    // editingReview = null; // This global variable seems unused for this flow now
}

// Utility functions
function calculateAverageRating(ratings) {
    if (ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, rating) => acc + rating.rating, 0);
    return sum / ratings.length;
}

function renderStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let html = '';
    
    for (let i = 0; i < fullStars; i++) {
        html += '★';
    }
    
    if (hasHalfStar) {
        html += '☆';
    }
    
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    for (let i = 0; i < emptyStars; i++) {
        html += '☆';
    }
    
    return html;
}

// Helper function to parse and clean tags from user input
function parseAndCleanTags(tagsInput) {
    if (!tagsInput || typeof tagsInput !== 'string') {
        return [];
    }
    
    // Split by various delimiters: comma, Chinese comma, semicolon, Chinese semicolon, Chinese enumeration mark
    const delimiters = /[,，;；、]/;
    const rawTags = tagsInput.split(delimiters);
    
    const cleanedTags = rawTags
        .map(tag => {
            // Trim whitespace
            tag = tag.trim();
            
            // Remove symbols at the beginning and end that are not letters, Chinese characters, or numbers
            // Keep only: a-z, A-Z, 0-9, Chinese characters (Unicode ranges), and spaces in the middle
            tag = tag.replace(/^[^\w\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f]+/, '');
            tag = tag.replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf\uf900-\ufaff\u3300-\u33ff\ufe30-\ufe4f\uf900-\ufaff\u2f800-\u2fa1f\s]+$/, '');
            
            return tag;
        })
        .filter(tag => tag.length > 0) // Remove empty tags
        .filter((tag, index, array) => array.indexOf(tag) === index); // Remove duplicates
    
    return cleanedTags;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showNotification(message) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        z-index: 1000;
        font-weight: 500;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Note: Sample data function removed as we now use backend API for all data
// Daily usage tracking still uses local storage for client-side rate limiting 

// User Space Modal
async function showUserSpacePage() {
    hideAllPages();
    document.getElementById('user-space-page').classList.add('active');
    await renderUserSpacePage();
}

async function renderUserSpacePage() {
    const container = document.getElementById('user-space-page').querySelector('.user-space-main');
    
    if (!currentUser) {
        container.innerHTML = '<div class="error">Please log in to view your user space.</div>';
        return;
    }
    
    container.innerHTML = '<div style="text-align:center;padding:2rem;">Loading user statistics...</div>';
    
    try {
        const stats = await fetchUserStats(currentUser.id);
        
        let html = `
                <h2>User Space - ${escapeHtml(currentUser.username)}</h2>
                
                <!-- User Profile Section -->
                <div class="user-profile-section">
                    <h3>Profile Information</h3>
                    <form id="user-info-form" onsubmit="updateUserInfo(event)">
                        <div class="form-group">
                            <label for="user-space-username">Username</label>
                            <input type="text" id="user-space-username" value="${escapeHtml(currentUser.username)}" required>
                        </div>
                        <div class="form-group">
                            <label for="user-space-email">Email</label>
                            <input type="email" id="user-space-email" value="${escapeHtml(currentUser.email)}" required readonly>
                        </div>

                        <h3 style="margin-top: 2rem; margin-bottom: 1rem; color: #2d3748;">Change Password</h3>
                        <div class="form-group">
                            <label for="current-password">Current Password</label>
                            <input type="password" id="current-password" placeholder="Enter current password">
                        </div>
                        <div class="form-group">
                            <label for="new-password">New Password</label>
                            <input type="password" id="new-password" placeholder="Enter new password">
                            <small style="color: #718096; font-size: 0.8rem; margin-top: 0.25rem; display: block;">
                                Password must be at least 8 characters and contain both letters and numbers
                            </small>
                        </div>
                        <div class="form-group">
                            <label for="confirm-new-password">Confirm New Password</label>
                            <input type="password" id="confirm-new-password" placeholder="Confirm new password">
                        </div>
                        
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary">Update Profile</button>
                        </div>
                    </form>
                </div>
                
                <hr>
                
                <!-- Statistics Overview -->
                <div class="user-stats-section">
                    <h3>Your Statistics</h3>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-number">${stats.totals.total_topics}</div>
                            <div class="stat-label">Topics Created</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.totals.total_objects}</div>
                            <div class="stat-label">Objects Created</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.totals.total_ratings}</div>
                            <div class="stat-label">Ratings Given</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.totals.total_proposals}</div>
                            <div class="stat-label">Proposals Made</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${stats.totals.total_votes}</div>
                            <div class="stat-label">Votes Cast</div>
                        </div>
                    </div>
                </div>
                
                <hr>
                
                <!-- Recent Activity -->
                <div class="user-activity-section">
                    <h3>Recent Activity (Last 30 Days)</h3>
                    <div id="user-recent-activity"></div>
                </div>
                
                <!-- Daily Activity Chart -->
                <div class="user-daily-chart-section">
                    <h3>Daily Activity (Last 7 Days)</h3>
                    <div id="user-daily-chart-container">
                        <canvas id="user-daily-chart" width="400" height="200"></canvas>
                    </div>
                </div>
        `;
        
        container.innerHTML = html;
        
        // Render recent activity
        renderUserRecentActivity(stats.recent_activity);
        
        // Render daily activity chart
        renderUserDailyChart(stats.daily_activity);
        
    } catch (error) {
        console.error('Error loading user statistics:', error);
        container.innerHTML = '<div class="error">Failed to load user statistics: ' + error.message + '</div>';
    }
}

// API functions for user statistics
async function fetchUserStats(userId) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/users/${userId}/stats`, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to fetch user statistics');
    return await res.json();
}

// API functions for user profiles and ratings
async function fetchUserProfile(userId) {
    const res = await fetch(BACKEND_URL + `/api/users/${userId}/profile`);
    if (!res.ok) throw new Error('Failed to fetch user profile');
    return await res.json();
}

async function rateUser(userId, rating) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/users/${userId}/rate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ rating })
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to rate user');
    }
    return await res.json();
}

async function fetchMyUserRating(userId) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/users/${userId}/my-rating`, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to fetch user rating');
    return await res.json();
}

async function checkUserRestrictions(userId) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/users/${userId}/restrictions`, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to check user restrictions');
    return await res.json();
}

// Fetch editors for a topic or object
async function fetchEditors(targetType, targetId) {
    try {
        const res = await fetch(BACKEND_URL + `/api/editors/${targetType}/${targetId}`);
        if (!res.ok) throw new Error('Failed to fetch editors');
        return await res.json();
    } catch (error) {
        console.error('Error fetching editors:', error);
        return [];
    }
}

// Fetch edit history for a topic or object
async function fetchEditHistory(targetType, targetId) {
    try {
        const res = await fetch(BACKEND_URL + `/api/edit-history/${targetType}/${targetId}`);
        if (!res.ok) throw new Error('Failed to fetch edit history');
        return await res.json();
    } catch (error) {
        console.error('Error fetching edit history:', error);
        return [];
    }
}

async function updateUserProfile(userId, username, email) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/users/${userId}/profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ username, email })
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update profile');
    }
    return await res.json();
}

async function updateUserProfileWithPassword(userId, username, email, currentPassword, newPassword) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/users/${userId}/profile`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ username, email, currentPassword, newPassword })
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update profile');
    }
    return await res.json();
}

async function updateUserInfo(event) {
    event.preventDefault();
    
    const newUsernameElement = document.getElementById('user-space-username');
    const newEmailElement = document.getElementById('user-space-email');
    const currentPasswordElement = document.getElementById('current-password');
    const newPasswordElement = document.getElementById('new-password');
    const confirmNewPasswordElement = document.getElementById('confirm-new-password');

    // Username and email are required, so if their elements are missing, it's a critical issue.
    if (!newUsernameElement || !newEmailElement) {
        alert('User profile form is not loaded correctly. Please try refreshing the page.');
        return;
    }
    const newUsername = newUsernameElement.value.trim();
    const newEmail = newEmailElement.value.trim();

    // Password fields might be optional to fill.
    // If an element isn't found (is null), default its value to an empty string.
    const currentPassword = currentPasswordElement ? currentPasswordElement.value : "";
    const newPassword = newPasswordElement ? newPasswordElement.value : "";
    const confirmNewPassword = confirmNewPasswordElement ? confirmNewPasswordElement.value : "";
    
    if (!newUsername || !newEmail) {
        alert('Username and email cannot be empty');
        return;
    }
    
    // Check if password change is requested
    const isPasswordChange = currentPassword || newPassword || confirmNewPassword;
    
    if (isPasswordChange) {
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            alert('Please fill in all password fields to change your password');
            return;
        }
        
        if (newPassword !== confirmNewPassword) {
            alert('New passwords do not match');
            return;
        }
        
        // Validate new password
        if (newPassword.length < 8) {
            alert('New password must be at least 8 characters long');
            return;
        }
        
        const hasLetter = /[a-zA-Z]/.test(newPassword);
        const hasNumber = /\d/.test(newPassword);
        
        if (!hasLetter || !hasNumber) {
            alert('New password must contain both letters and numbers');
            return;
        }
    }
    
    const profileChanged = newUsername !== currentUser.username || newEmail !== currentUser.email;
    
    if (!profileChanged && !isPasswordChange) {
        showNotification('No changes to save');
        return;
    }
    
    try {
        let result;
        
        if (isPasswordChange) {
            // Update profile with password change
            result = await updateUserProfileWithPassword(currentUser.id, newUsername, newEmail, currentPassword, newPassword);
        } else {
            // Update profile only
            result = await updateUserProfile(currentUser.id, newUsername, newEmail);
        }
        
        // Update current user and token
        currentUser = result.user;
        saveAuthToken(result.token);
        
        updateUserInterface();
        
        if (isPasswordChange) {
            showNotification('Profile and password updated successfully!');
            // Clear password fields
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-new-password').value = '';
        } else {
            showNotification('Profile updated successfully!');
        }
        
        // Refresh the user space page to show updated stats (only if currently visible)
        const userSpacePage = document.getElementById('user-space-page');
        if (userSpacePage && userSpacePage.classList.contains('active')) {
            await renderUserSpacePage();
        }
        
    } catch (error) {
        alert('Failed to update profile: ' + error.message);
    }
}

function renderUserRecentActivity(activities) {
    const container = document.getElementById('user-recent-activity');
    
    if (!activities || activities.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No recent activity in the last 30 days.</p></div>';
        return;
    }
    
    let html = '<div class="activity-list">';
    
    activities.forEach(activity => {
        let activityText = '';
        let extraInfo = '';
        
        switch (activity.type) {
            case 'topic_created':
                activityText = `Created topic: <strong>${escapeHtml(activity.item_name)}</strong>`;
                break;
            case 'object_created':
                activityText = `Created object: <strong>${escapeHtml(activity.item_name)}</strong>`;
                if (activity.topic_name) {
                    extraInfo = ` in topic "${escapeHtml(activity.topic_name)}"`;
                }
                break;
            case 'rating_submitted':
                activityText = `Rated object: <strong>${escapeHtml(activity.item_name)}</strong>`;
                extraInfo = ` (${activity.rating} stars)`;
                if (activity.topic_name) {
                    extraInfo += ` in topic "${escapeHtml(activity.topic_name)}"`;
                }
                break;
            case 'proposal_created':
                activityText = `Created ${activity.proposal_type} proposal for ${activity.target_type} (ID: ${activity.target_id})`;
                if (activity.status) {
                    const statusColor = activity.status === 'approved' ? '#38a169' : activity.status === 'rejected' ? '#e53e3e' : '#718096';
                    extraInfo += ` - <span style="color: ${statusColor}; font-weight: bold;">${activity.status.toUpperCase()}</span>`;
                }
                if (activity.reason) {
                    extraInfo += ` - Reason: "${escapeHtml(activity.reason)}"`;
                }
                if (activity.new_value && activity.proposal_type === 'edit') {
                    try {
                        const changes = JSON.parse(activity.new_value);
                        if (changes.name) {
                            extraInfo += ` - Proposed name: "${escapeHtml(changes.name)}"`;
                        }
                    } catch (e) {
                        extraInfo += ` - Proposed change: "${escapeHtml(activity.new_value)}"`;
                    }
                }
                break;
            case 'vote_cast':
                activityText = `Voted ${activity.vote === 1 ? 'to approve' : 'to reject'} a ${activity.proposal_type} proposal for ${activity.target_type}`;
                break;
            default:
                activityText = `${activity.type}: ${escapeHtml(activity.item_name || '')}`;
        }
        
        html += `
            <div class="activity-item">
                <div class="activity-content">
                    <span class="activity-text">${activityText}${extraInfo}</span>
                    <span class="activity-time">${formatDate(activity.timestamp)}</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function renderUserDailyChart(dailyStats) {
    // Load Chart.js if not already loaded
    if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => renderUserDailyChart(dailyStats);
        document.body.appendChild(script);
        document.getElementById('user-daily-chart-container').innerHTML = '<div style="text-align:center;padding:1rem;">Loading chart...</div>';
        return;
    }
    
    // Process daily stats data
    const last7Days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        last7Days.push(date.toISOString().split('T')[0]);
    }
    
    const topicsData = last7Days.map(date => {
        const stat = dailyStats.find(s => s.date === date && s.type === 'topics');
        return stat ? stat.count : 0;
    });
    
    const objectsData = last7Days.map(date => {
        const stat = dailyStats.find(s => s.date === date && s.type === 'objects');
        return stat ? stat.count : 0;
    });
    
    const ratingsData = last7Days.map(date => {
        const stat = dailyStats.find(s => s.date === date && s.type === 'ratings');
        return stat ? stat.count : 0;
    });
    
    const labels = last7Days.map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const chartElement = document.getElementById('user-daily-chart');
    if (!chartElement) {
        console.log('Chart canvas element not found - chart will be rendered when user space page is opened');
        return;
    }
    const ctx = chartElement.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.userDailyChart) {
        window.userDailyChart.destroy();
    }
    
    window.userDailyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Topics',
                    data: topicsData,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Objects',
                    data: objectsData,
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Ratings',
                    data: ratingsData,
                    backgroundColor: 'rgba(245, 158, 11, 0.8)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// User Profile Page
async function showUserProfilePage(userId) {
    hideAllPages();
    document.getElementById('user-profile-page').classList.add('active');
    await renderUserProfilePage(userId);
}

async function renderUserProfilePage(userId) {
    const container = document.getElementById('user-profile-content');
    
    if (!userId) {
        container.innerHTML = '<div class="error">Invalid user ID.</div>';
        return;
    }
    
    container.innerHTML = '<div style="text-align:center;padding:2rem;">Loading user profile...</div>';
    
    try {
        const profile = await fetchUserProfile(userId);
        
        // Get current user's rating for this user if logged in
        let myRating = null;
        if (currentUser && currentUser.id !== parseInt(userId)) {
            try {
                const ratingData = await fetchMyUserRating(userId);
                myRating = ratingData.rating;
            } catch (error) {
                console.log('No rating found or not logged in');
            }
        }
        
        let html = `
            <div class="user-profile-container">
                <div class="profile-header">
                    <div class="profile-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="profile-info">
                        <h2>${escapeHtml(profile.username)}</h2>
                        <div class="profile-meta">
                            <span class="join-date">Joined: ${formatDate(profile.created_at)}</span>
                            ${profile.is_restricted ? `
                                <div class="restriction-notice">
                                    <i class="fas fa-ban"></i>
                                    <span>Editing restricted until ${formatDate(profile.restriction_end)}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="profile-stats">
                    <div class="stat-item">
                        <div class="stat-number">${profile.topic_count}</div>
                        <div class="stat-label">Topics Created</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${profile.object_count}</div>
                        <div class="stat-label">Objects Created</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${profile.rating_count}</div>
                        <div class="stat-label">Ratings Given</div>
                    </div>
                </div>
                
                <div class="user-rating-section">
                    <h3>Community Rating</h3>
                    <div class="rating-display">
                        <div class="likes-dislikes">
                            <div class="likes">
                                <i class="fas fa-thumbs-up"></i>
                                <span>${profile.likes} likes</span>
                            </div>
                            <div class="dislikes">
                                <i class="fas fa-thumbs-down"></i>
                                <span>${profile.dislikes} dislikes</span>
                            </div>
                        </div>
                        
                        ${currentUser && currentUser.id !== parseInt(userId) ? `
                            <div class="rating-actions">
                                <h4>Rate this user:</h4>
                                <div class="rating-buttons">
                                    <button class="btn ${myRating === 1 ? 'btn-primary' : 'btn-secondary'}" 
                                            onclick="rateUserUI('${userId}', 1)">
                                        <i class="fas fa-thumbs-up"></i> Like
                                    </button>
                                    <button class="btn ${myRating === -1 ? 'btn-danger' : 'btn-secondary'}" 
                                            onclick="rateUserUI('${userId}', -1)">
                                        <i class="fas fa-thumbs-down"></i> Dislike
                                    </button>
                                    ${myRating !== null ? `
                                        <button class="btn btn-small btn-secondary" onclick="removeUserRatingUI('${userId}')">
                                            Remove Rating
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        ` : currentUser && currentUser.id === parseInt(userId) ? `
                            <div class="own-profile-notice">
                                <i class="fas fa-info-circle"></i>
                                <span>This is your profile</span>
                            </div>
                        ` : `
                            <div class="login-notice">
                                <i class="fas fa-sign-in-alt"></i>
                                <span>Login to rate this user</span>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading user profile:', error);
        container.innerHTML = '<div class="error">Failed to load user profile: ' + error.message + '</div>';
    }
}

async function rateUserUI(userId, rating) {
    if (!currentUser) {
        alert('Please login to rate users');
        return;
    }
    
    try {
        const result = await rateUser(userId, rating);
        showNotification(rating === 1 ? 'User liked!' : 'User disliked!');
        
        if (result.dislike_count && result.dislike_count % 5 === 0) {
            showNotification(`User has been restricted due to ${result.dislike_count} dislikes`, 'warning');
        }
        
        // Refresh the profile page
        await renderUserProfilePage(userId);
    } catch (error) {
        alert('Failed to rate user: ' + error.message);
    }
}

async function removeUserRatingUI(userId) {
    // To remove a rating, we can just call the rate endpoint with the opposite of current rating
    // But for simplicity, let's just refresh and let user click again
    showNotification('Click the opposite button to change your rating');
}

// Make username clickable function
function makeUsernameClickable(username, userId) {
    const displayName = username && username.trim() ? escapeHtml(username) : 'Unknown User';
    if (!userId) return displayName;
    return `<span class="clickable-username" onclick="event.stopPropagation(); showUserProfilePage('${userId}')">${displayName}</span>`;
}

// Render editors display with ellipsis for more than 3 editors
async function renderEditorsDisplay(targetType, targetId, creatorUsername, creatorId) {
    try {
        const editors = await fetchEditors(targetType, targetId);
        
        // If no edit history, just show creator
        if (editors.length === 0) {
            return `by ${makeUsernameClickable(creatorUsername, creatorId)}`;
        }
        
        // Get unique editors (including creator if they edited)
        const uniqueEditors = [];
        const seenIds = new Set();
        
        // Add creator first if they're in the edit history
        const creatorInHistory = editors.find(e => e.id === creatorId);
        if (creatorInHistory) {
            uniqueEditors.push(creatorInHistory);
            seenIds.add(creatorId);
        } else {
            // Add creator even if not in edit history
            uniqueEditors.push({ id: creatorId, username: creatorUsername });
            seenIds.add(creatorId);
        }
        
        // Add other editors
        editors.forEach(editor => {
            if (!seenIds.has(editor.id)) {
                uniqueEditors.push(editor);
                seenIds.add(editor.id);
            }
        });
        
        if (uniqueEditors.length === 1) {
            return `by ${makeUsernameClickable(uniqueEditors[0].username, uniqueEditors[0].id)}`;
        }
        
        if (uniqueEditors.length <= 3) {
            const editorLinks = uniqueEditors.map(editor => 
                makeUsernameClickable(editor.username, editor.id)
            );
            return `by ${editorLinks.join(', ')}`;
        }
        
        // More than 3 editors - show first 3 and ellipsis
        const firstThree = uniqueEditors.slice(0, 3);
        const remaining = uniqueEditors.slice(3);
        
        const firstThreeLinks = firstThree.map(editor => 
            makeUsernameClickable(editor.username, editor.id)
        );
        
        const ellipsisId = `editors-ellipsis-${targetType}-${targetId}`;
        const popupId = `editors-popup-${targetType}-${targetId}`;
        
        return `by ${firstThreeLinks.join(', ')}, <span class="editors-ellipsis" id="${ellipsisId}" onclick="showEditorsPopup('${popupId}', event)">...</span>
            <div class="editors-popup" id="${popupId}" style="display: none;">
                <div class="editors-popup-content">
                    <div class="editors-popup-header">
                        <h4>All Editors</h4>
                        <button class="close-popup" onclick="hideEditorsPopup('${popupId}')">&times;</button>
                    </div>
                    <div class="editors-list">
                        ${uniqueEditors.map(editor => `
                            <div class="editor-item">
                                ${makeUsernameClickable(editor.username, editor.id)}
                                ${editor.first_edit ? `<span class="edit-date">First edit: ${formatDate(editor.first_edit)}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>`;
    } catch (error) {
        console.error('Error rendering editors display:', error);
        return `by ${makeUsernameClickable(creatorUsername, creatorId)}`;
    }
}

// Show editors popup
function showEditorsPopup(popupId, event) {
    event.stopPropagation();
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.style.display = 'block';
        
        // Position popup near the ellipsis
        const rect = event.target.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = rect.left + 'px';
        popup.style.top = (rect.bottom + 5) + 'px';
        popup.style.zIndex = '1000';
        
        // Close popup when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target)) {
                    hideEditorsPopup(popupId);
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 100);
    }
}

// Hide editors popup
function hideEditorsPopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.style.display = 'none';
    }
}

// Admin panel UI
function showAdminPanel() {
    if (!isAdmin()) return;
    renderAdminPanel();
    document.getElementById('admin-panel-modal').style.display = 'flex';
}

function closeAdminPanel() {
    document.getElementById('admin-panel-modal').style.display = 'none';
}

async function renderAdminPanel() {
    const modal = document.getElementById('admin-panel-modal');
    let html = `
        <div class='modal-content admin-panel-modal-content'>
            <div class='modal-header'>
                <h2>Admin Panel</h2>
                <button class='modal-close' onclick='closeAdminPanel()'>
                    <i class='fas fa-times'></i>
                </button>
            </div>
            <div class='modal-body'>
                <div class="admin-tabs">
                    <button class="admin-tab active" onclick="showAdminTab('users')">User Management</button>
                    <button class="admin-tab" onclick="showAdminTab('content-filter')">Content Filter</button>
                    <button class="admin-tab" onclick="showAdminTab('blocked-emails')">Blocked Emails</button>
                    <button class="admin-tab" onclick="showAdminTab('domain-restrictions')">Domain Restrictions</button>
                </div>
                <div id="admin-users-tab" class="admin-tab-content active">
                    <h3>All Users</h3>
                    <div id='admin-users-list'>Loading...</div>
                </div>
                <div id="admin-content-filter-tab" class="admin-tab-content" style="display: none;">
                    <h3>Content Filter Management</h3>
                    <div id='admin-content-filter-content'>Loading...</div>
                </div>
                <div id="admin-blocked-emails-tab" class="admin-tab-content" style="display: none;">
                    <h3>Blocked Email Management</h3>
                    <div id='admin-blocked-emails-content'>Loading...</div>
                </div>
                <div id="admin-domain-restrictions-tab" class="admin-tab-content" style="display: none;">
                    <h3>Email Domain Restrictions</h3>
                    <div id='admin-domain-restrictions-content'>Loading...</div>
                </div>
            </div>
        </div>
    `;
    modal.innerHTML = html;
    await renderAdminUsersList();
    await renderAdminContentFilter();
    await renderAdminBlockedEmails();
    await renderAdminDomainRestrictions();
}

async function renderAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/users', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to fetch users and parse error response.' }));
            throw new Error(errorData.error || `Failed to fetch users. Status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result || !Array.isArray(result.users)) {
            console.error('API response for admin users is not in the expected format:', result);
            throw new Error('Received invalid user data from server.');
        }
        const users = result.users;
        
        let html = '<table style="width:100%;border-collapse:collapse;border:1px solid #ddd;"><tr style="background:#f5f5f5;"><th style="padding:8px;border:1px solid #ddd;">Username</th><th style="padding:8px;border:1px solid #ddd;">Email</th><th style="padding:8px;border:1px solid #ddd;">Admin</th><th style="padding:8px;border:1px solid #ddd;">Actions</th></tr>';
        
        users.forEach(user => {
            html += `<tr><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(user.username)}</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(user.email)}</td><td style="padding:8px;border:1px solid #ddd;">${user.is_admin ? 'Yes' : 'No'}</td><td style="padding:8px;border:1px solid #ddd;">`;
            if (user.id !== currentUser.id) {
                html += `<button class='btn btn-small btn-secondary' onclick='adminEditUser(${user.id}, "${escapeHtml(user.username)}", "${escapeHtml(user.email)}", ${user.is_admin})' style='margin-right:5px;'>Edit</button>`;
                html += `<button class='btn btn-small btn-danger' onclick='adminDeleteUser(${user.id}, "${escapeHtml(user.username)}")'>Delete</button>`;
            } else {
                html += 'Current User';
            }
            html += '</td></tr>';
        });
        html += '</table>';
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div class="error">Failed to load users: ' + error.message + '</div>';
    }
}

async function adminEditUser(userId, currentUsername, currentEmail, isCurrentlyAdmin) {
    const newUsername = prompt('Edit username:', currentUsername);
    if (!newUsername || newUsername === currentUsername) return;
    
    const newEmail = prompt('Edit email:', currentEmail);
    if (!newEmail || newEmail === currentEmail) return;
    
    const makeAdmin = confirm('Make this user an admin?');
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + `/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                username: newUsername,
                email: newEmail,
                is_admin: makeAdmin
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update user');
        }
        
        await renderAdminUsersList();
        showNotification('User updated successfully');
    } catch (error) {
        alert('Failed to update user: ' + error.message);
    }
}

async function adminDeleteUser(userId, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + `/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete user');
        }
        
        await renderAdminUsersList();
        showNotification('User deleted successfully');
    } catch (error) {
        alert('Failed to delete user: ' + error.message);
    }
}

// Admin tab switching
function showAdminTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.admin-tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(`admin-${tabName}-tab`).style.display = 'block';
    
    // Add active class to selected tab
    event.target.classList.add('active');
}

// Admin direct edit/delete for topics/objects/users
function isAdmin() { return currentUser && currentUser.isAdmin; }

// Admin proposal actions
async function adminApproveProposal(proposalId) {
    if (!isAdmin()) return;
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + `/api/admin/proposals/${proposalId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to approve proposal');
        }
        
        showNotification('Proposal approved and executed by admin');
        if (typeof document.renderProposals === 'function') {
            document.renderProposals();
        }
        updateProposalCount();
    } catch (error) {
        alert('Failed to approve proposal: ' + error.message);
    }
}

async function adminVetoProposal(proposalId) {
    if (!isAdmin()) return;
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + `/api/admin/proposals/${proposalId}/reject`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to reject proposal');
        }
        
        showNotification('Proposal rejected by admin');
        if (typeof document.renderProposals === 'function') {
            document.renderProposals();
        }
        updateProposalCount();
    } catch (error) {
        alert('Failed to reject proposal: ' + error.message);
    }
}

// Add global for selected time range
let objectStatsSelectedRange = null;
let objectStatsGranularity = 'day';
async function showObjectStatsPage() {
    hideAllPages();
    document.getElementById('object-stats-page').classList.add('active');
    await renderObjectStatsPage();
}

async function showTopicStatsPage() {
    hideAllPages();
    document.getElementById('topic-stats-page').classList.add('active');
    await renderTopicStatsPage();
}
async function renderObjectStatsPage() {
    const container = document.getElementById('object-stats-content');
    
    try {
        const object = await fetchObject(currentObjectId);
        const ratings = await fetchRatings(currentObjectId);
        const tags = await fetchObjectTags(currentObjectId);
        
        if (!object) {
            container.innerHTML = '<div class="error">Object not found</div>';
            return;
        }
        
        // Chart.js loader
        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => renderObjectStatsPage();
            document.body.appendChild(script);
            container.innerHTML = '<div style="text-align:center;padding:2rem;">Loading charts...</div>';
            return;
        }
        
        // Chart.js zoom/drag plugin loader
        if (!window.ChartZoom) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js';
            script.onload = () => { window.ChartZoom = true; renderObjectStatsPage(); };
            document.body.appendChild(script);
            return;
        }
        
        // Calculate statistics
        const averageRating = calculateAverageRating(ratings);
        const totalRatings = ratings.length;
        const ratingCounts = [0, 0, 0, 0, 0];
        ratings.forEach(r => {
            if (r.rating >= 1 && r.rating <= 5) ratingCounts[r.rating - 1]++;
        });
        
        // Calculate additional statistics
        const mostRecentRating = ratings.length > 0 ? new Date(Math.max(...ratings.map(r => new Date(r.created_at)))) : null;
        const oldestRating = ratings.length > 0 ? new Date(Math.min(...ratings.map(r => new Date(r.created_at)))) : null;
        const uniqueReviewers = new Set(ratings.map(r => r.user_id)).size;
        const ratingsWithReviews = ratings.filter(r => r.review && r.review.trim()).length;
        
        // Create comprehensive HTML layout
        let html = `
            <div class="object-stats-container">
                <!-- Header Section -->
                <div class="stats-header">
                    <div class="stats-title-section">
                        <h2><i class="fas fa-chart-line"></i> Statistics for: ${escapeHtml(object.name)}</h2>
                        <div class="object-meta">
                            <span class="created-by">Created by: ${makeUsernameClickable(object.creator_username || 'Unknown', object.creator_id)}</span>
                            <span class="created-date">Created: ${formatDate(object.created_at)}</span>
                        </div>
                        ${tags.length > 0 ? `
                            <div class="object-tags">
                                ${tags.map(tag => `<span class="tag">${escapeHtml(tag.name)}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Key Statistics Cards -->
                <div class="stats-overview">
                    <div class="stat-card primary">
                        <div class="stat-icon"><i class="fas fa-star"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${averageRating > 0 ? averageRating.toFixed(2) : 'N/A'}</div>
                            <div class="stat-label">Average Rating</div>
                            ${averageRating > 0 ? `<div class="stat-stars">${renderStars(averageRating)}</div>` : ''}
                        </div>
                    </div>
                    
                    <div class="stat-card secondary">
                        <div class="stat-icon"><i class="fas fa-users"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${totalRatings}</div>
                            <div class="stat-label">Total Ratings</div>
                            <div class="stat-detail">${uniqueReviewers} unique reviewer${uniqueReviewers !== 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    
                    <div class="stat-card tertiary">
                        <div class="stat-icon"><i class="fas fa-comment"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${ratingsWithReviews}</div>
                            <div class="stat-label">Written Reviews</div>
                            <div class="stat-detail">${totalRatings > 0 ? Math.round((ratingsWithReviews / totalRatings) * 100) : 0}% with text</div>
                        </div>
                    </div>
                    
                    <div class="stat-card quaternary">
                        <div class="stat-icon"><i class="fas fa-clock"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${mostRecentRating ? formatDate(mostRecentRating).split(',')[0] : 'N/A'}</div>
                            <div class="stat-label">Latest Rating</div>
                            <div class="stat-detail">${oldestRating ? 'Since ' + formatDate(oldestRating).split(',')[0] : ''}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Controls Section -->
                <div class="stats-controls">
                    <div class="control-group">
                        <label for="stats-granularity"><i class="fas fa-calendar-alt"></i> Time Granularity:</label>
                        <select id="stats-granularity" class="control-select">
                            <option value="minute">Minute</option>
                            <option value="hour">Hour</option>
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                            <option value="year">Year</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary" onclick="objectStatsSelectedRange=null;renderObjectStatsPage()">
                        <i class="fas fa-undo"></i> Reset Selection
                    </button>
                </div>
                
                <!-- Charts Section -->
                <div class="charts-container">
                    <!-- Rating Distribution -->
                    <div class="chart-section">
                        <div class="chart-header">
                            <h3><i class="fas fa-chart-bar"></i> Rating Distribution</h3>
                            <div class="chart-info">
                                ${objectStatsSelectedRange ? 'Filtered by time selection' : 'All ratings'}
                            </div>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="ratings-bar-chart"></canvas>
                        </div>
                    </div>
                    
                    <!-- Rating Trends -->
                    <div class="chart-section full-width">
                        <div class="chart-header">
                            <h3><i class="fas fa-chart-line"></i> Rating Trends Over Time</h3>
                            <div class="chart-info">
                                Drag to zoom, pan to navigate • Average rating per time period
                            </div>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="ratings-line-chart"></canvas>
                        </div>
                    </div>
                    
                    <!-- Rating Frequency -->
                    <div class="chart-section">
                        <div class="chart-header">
                            <h3><i class="fas fa-chart-pie"></i> Rating Frequency</h3>
                            <div class="chart-info">
                                Distribution of ratings over time
                            </div>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="ratings-doughnut-chart"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Detailed Statistics -->
                <div class="detailed-stats">
                    <h3><i class="fas fa-list-ul"></i> Detailed Breakdown</h3>
                    <div class="stats-table">
                        <div class="stats-row">
                            <span class="stats-label">5-Star Ratings:</span>
                            <span class="stats-value">${ratingCounts[4]} (${totalRatings > 0 ? Math.round((ratingCounts[4] / totalRatings) * 100) : 0}%)</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">4-Star Ratings:</span>
                            <span class="stats-value">${ratingCounts[3]} (${totalRatings > 0 ? Math.round((ratingCounts[3] / totalRatings) * 100) : 0}%)</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">3-Star Ratings:</span>
                            <span class="stats-value">${ratingCounts[2]} (${totalRatings > 0 ? Math.round((ratingCounts[2] / totalRatings) * 100) : 0}%)</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">2-Star Ratings:</span>
                            <span class="stats-value">${ratingCounts[1]} (${totalRatings > 0 ? Math.round((ratingCounts[1] / totalRatings) * 100) : 0}%)</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">1-Star Ratings:</span>
                            <span class="stats-value">${ratingCounts[0]} (${totalRatings > 0 ? Math.round((ratingCounts[0] / totalRatings) * 100) : 0}%)</span>
                        </div>
                        <div class="stats-row highlight">
                            <span class="stats-label">Most Common Rating:</span>
                            <span class="stats-value">${totalRatings > 0 ? (ratingCounts.indexOf(Math.max(...ratingCounts)) + 1) + ' Stars' : 'N/A'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    // Set dropdown value and event
    const granSel = document.getElementById('stats-granularity');
    granSel.value = objectStatsGranularity || 'day';
    granSel.onchange = function() {
        objectStatsGranularity = this.value;
        objectStatsSelectedRange = null;
        renderObjectStatsPage();
    };
    // --- Line chart: average score over time ---
    const granularity = objectStatsGranularity || 'day';
    const timeBuckets = {};
    // Helper to format date by granularity
    function formatDate(date, gran) {
        const d = new Date(date);
        if (gran === 'minute') return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()+' '+d.getHours()+':'+String(d.getMinutes()).padStart(2,'0');
        if (gran === 'hour') return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()+' '+d.getHours()+':00';
        if (gran === 'day') return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
        if (gran === 'week') {
            const onejan = new Date(d.getFullYear(),0,1);
            const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay()+1)/7);
            return d.getFullYear()+'-W'+week;
        }
        if (gran === 'month') return d.getFullYear()+'-'+(d.getMonth()+1);
        if (gran === 'year') return d.getFullYear()+'';
        return d.toISOString();
    }
    // Bucket ratings
    ratings.forEach(r => {
        const key = formatDate(r.created_at, granularity);
        if (!timeBuckets[key]) timeBuckets[key] = [];
        timeBuckets[key].push({rating: r.rating, createdAt: r.created_at});
    });
    // Sort keys chronologically
    const sortedKeys = Object.keys(timeBuckets).sort((a,b) => new Date(a) - new Date(b));
    const timeLabels = [];
    const avgScores = [];
    const bucketRanges = [];
    sortedKeys.forEach(key => {
        timeLabels.push(key);
        const avg = timeBuckets[key].reduce((a,b)=>a+b.rating,0)/timeBuckets[key].length;
        avgScores.push(avg);
        // For selection: store min/max date in this bucket
        const dates = timeBuckets[key].map(x=>new Date(x.createdAt));
        bucketRanges.push({min: Math.min(...dates), max: Math.max(...dates)});
    });
    // --- Line chart ---

    // --- Bar chart: rating counts (filtered by selection if any) ---
    let filteredRatings = ratings;
    if (objectStatsSelectedRange && objectStatsSelectedRange.length === 2) {
        const [minT, maxT] = objectStatsSelectedRange;
        filteredRatings = ratings.filter(r => {
            const t = new Date(r.created_at).getTime();
            return t >= minT && t <= maxT;
        });
    }
    const filteredRatingCounts = [0,0,0,0,0];
    filteredRatings.forEach(r => {
        if (r.rating >= 1 && r.rating <= 5) filteredRatingCounts[r.rating-1]++;
    });
    new Chart(document.getElementById('ratings-bar-chart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'],
            datasets: [{
                label: 'Number of Ratings',
                data: filteredRatingCounts,
                backgroundColor: ['#f87171','#fbbf24','#facc15','#34d399','#60a5fa'],
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = filteredRatingCounts.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((context.parsed.x / total) * 100) : 0;
                            return `${context.parsed.x} ratings (${percentage}%)`;
                        }
                    }
                }
            },
            scales: { 
                x: { 
                    beginAtZero: true, 
                    precision: 0,
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                y: {
                    grid: { display: false }
                }
            }
        }
    });
    
    // Enhanced line chart with better styling
    const lineCtx = document.getElementById('ratings-line-chart').getContext('2d');
    if (window.objectStatsLineChart) window.objectStatsLineChart.destroy();
    window.objectStatsLineChart = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Average Rating',
                data: avgScores,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.1)',
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#6366f1',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#6366f1',
                    borderWidth: 1
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { drag: { enabled: true }, mode: 'x' },
                    limits: { x: { min: 0, max: timeLabels.length-1 } },
                    onZoomComplete: ({chart}) => {
                        const xScale = chart.scales.x;
                        const minIdx = Math.max(0, Math.floor(xScale.min));
                        const maxIdx = Math.min(bucketRanges.length-1, Math.ceil(xScale.max));
                        if (minIdx >= 0 && maxIdx < bucketRanges.length) {
                            objectStatsSelectedRange = [bucketRanges[minIdx].min, bucketRanges[maxIdx].max];
                        } else {
                            objectStatsSelectedRange = null;
                        }
                        renderObjectStatsPage();
                    },
                    onPanComplete: ({chart}) => {
                        const xScale = chart.scales.x;
                        const minIdx = Math.max(0, Math.floor(xScale.min));
                        const maxIdx = Math.min(bucketRanges.length-1, Math.ceil(xScale.max));
                        if (minIdx >= 0 && maxIdx < bucketRanges.length) {
                            objectStatsSelectedRange = [bucketRanges[minIdx].min, bucketRanges[maxIdx].max];
                        } else {
                            objectStatsSelectedRange = null;
                        }
                        renderObjectStatsPage();
                    }
                }
            },
            scales: {
                y: { 
                    min: 1, 
                    max: 5, 
                    ticks: { stepSize: 1 },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    title: {
                        display: true,
                        text: 'Average Rating'
                    }
                },
                x: { 
                    ticks: { autoSkip: true, maxTicksLimit: 10 },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    title: {
                        display: true,
                        text: 'Time Period'
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
    
    // Add doughnut chart for rating distribution
    const doughnutCtx = document.getElementById('ratings-doughnut-chart').getContext('2d');
    if (window.objectStatsDoughnutChart) window.objectStatsDoughnutChart.destroy();
    window.objectStatsDoughnutChart = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
            labels: ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'],
            datasets: [{
                data: ratingCounts,
                backgroundColor: ['#f87171', '#fbbf24', '#facc15', '#34d399', '#60a5fa'],
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = ratingCounts.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                            return `${context.label}: ${context.parsed} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '60%'
        }
    });
    
    } catch (error) {
        console.error('Error rendering object statistics:', error);
        container.innerHTML = '<div class="error">Failed to load statistics: ' + error.message + '</div>';
    }
}

async function renderTopicStatsPage() {
    const container = document.getElementById('topic-stats-content');
    
    try {
        const topic = await fetchTopic(currentTopicId);
        const objects = await fetchObjects(currentTopicId);
        const topicTags = await fetchTopicTags(currentTopicId);
        
        if (!topic) {
            container.innerHTML = '<div class="error">Topic not found</div>';
            return;
        }
        
        // Chart.js loader
        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => renderTopicStatsPage();
            document.body.appendChild(script);
            container.innerHTML = '<div style="text-align:center;padding:2rem;">Loading charts...</div>';
            return;
        }
        
        // Fetch all ratings for all objects in this topic
        const allRatings = [];
        const objectRatings = {};
        const objectDetails = {};
        
        for (const object of objects) {
            const ratings = await fetchRatings(object.id);
            allRatings.push(...ratings);
            objectRatings[object.id] = ratings;
            objectDetails[object.id] = object;
        }
        
        // Calculate comprehensive statistics
        const totalObjects = objects.length;
        const totalRatings = allRatings.length;
        const averageTopicRating = totalRatings > 0 ? allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings : 0;
        const uniqueReviewers = new Set(allRatings.map(r => r.user_id)).size;
        const ratingsWithReviews = allRatings.filter(r => r.review && r.review.trim()).length;
        
        // Object rankings by average rating
        const objectRankings = objects.map(obj => {
            const ratings = objectRatings[obj.id] || [];
            const avgRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0;
            return {
                ...obj,
                avgRating,
                totalRatings: ratings.length,
                ratingsWithReviews: ratings.filter(r => r.review && r.review.trim()).length
            };
        }).sort((a, b) => b.avgRating - a.avgRating);
        
        // Most active objects (by rating count)
        const mostActiveObjects = [...objectRankings].sort((a, b) => b.totalRatings - a.totalRatings);
        
        // Rating distribution across all objects
        const ratingCounts = [0, 0, 0, 0, 0];
        allRatings.forEach(r => {
            if (r.rating >= 1 && r.rating <= 5) ratingCounts[r.rating - 1]++;
        });
        
        // Time-based analysis
        const mostRecentRating = allRatings.length > 0 ? new Date(Math.max(...allRatings.map(r => new Date(r.created_at)))) : null;
        const oldestRating = allRatings.length > 0 ? new Date(Math.min(...allRatings.map(r => new Date(r.created_at)))) : null;
        
        // Activity over time (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentRatings = allRatings.filter(r => new Date(r.created_at) >= thirtyDaysAgo);
        
        // Create comprehensive HTML layout
        let html = `
            <div class="object-stats-container">
                <!-- Header Section -->
                <div class="stats-header">
                    <div class="stats-title-section">
                        <h2><i class="fas fa-chart-line"></i> Topic Statistics: ${escapeHtml(topic.name)}</h2>
                        <div class="object-meta">
                            <span class="created-by">Created by: ${makeUsernameClickable(topic.creator_username || 'Unknown', topic.creator_id)}</span>
                            <span class="created-date">Created: ${formatDate(topic.created_at)}</span>
                        </div>
                        ${topicTags.length > 0 ? `
                            <div class="object-tags">
                                ${topicTags.map(tag => `<span class="tag">${escapeHtml(tag.name)}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Key Statistics Cards -->
                <div class="stats-overview">
                    <div class="stat-card primary">
                        <div class="stat-icon"><i class="fas fa-star"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${averageTopicRating > 0 ? averageTopicRating.toFixed(2) : 'N/A'}</div>
                            <div class="stat-label">Average Topic Rating</div>
                            ${averageTopicRating > 0 ? `<div class="stat-stars">${renderStars(averageTopicRating)}</div>` : ''}
                        </div>
                    </div>
                    
                    <div class="stat-card secondary">
                        <div class="stat-icon"><i class="fas fa-cubes"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${totalObjects}</div>
                            <div class="stat-label">Total Objects</div>
                            <div class="stat-detail">${totalRatings} total ratings</div>
                        </div>
                    </div>
                    
                    <div class="stat-card tertiary">
                        <div class="stat-icon"><i class="fas fa-users"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${uniqueReviewers}</div>
                            <div class="stat-label">Unique Reviewers</div>
                            <div class="stat-detail">${ratingsWithReviews} written reviews</div>
                        </div>
                    </div>
                    
                    <div class="stat-card quaternary">
                        <div class="stat-icon"><i class="fas fa-chart-bar"></i></div>
                        <div class="stat-content">
                            <div class="stat-number">${recentRatings.length}</div>
                            <div class="stat-label">Recent Activity</div>
                            <div class="stat-detail">Last 30 days</div>
                        </div>
                    </div>
                </div>
                
                <!-- Charts Section -->
                <div class="charts-container">
                    <!-- Object Rankings -->
                    <div class="chart-section full-width">
                        <div class="chart-header">
                            <h3><i class="fas fa-trophy"></i> Object Rankings by Average Rating</h3>
                            <div class="chart-info">
                                Top-rated objects in this topic
                            </div>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="topic-rankings-chart"></canvas>
                        </div>
                    </div>
                    
                    <!-- Rating Distribution -->
                    <div class="chart-section">
                        <div class="chart-header">
                            <h3><i class="fas fa-chart-bar"></i> Overall Rating Distribution</h3>
                            <div class="chart-info">
                                All ratings across topic objects
                            </div>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="topic-ratings-bar-chart"></canvas>
                        </div>
                    </div>
                    
                    <!-- Activity Distribution -->
                    <div class="chart-section">
                        <div class="chart-header">
                            <h3><i class="fas fa-chart-pie"></i> Object Activity Distribution</h3>
                            <div class="chart-info">
                                Rating count per object
                            </div>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="topic-activity-chart"></canvas>
                        </div>
                    </div>
                    
                    <!-- Rating Trends Over Time -->
                    <div class="chart-section full-width">
                        <div class="chart-header">
                            <h3><i class="fas fa-chart-line"></i> Rating Activity Over Time</h3>
                            <div class="chart-info">
                                Number of ratings submitted over time
                            </div>
                        </div>
                        <div class="chart-wrapper">
                            <canvas id="topic-timeline-chart"></canvas>
                        </div>
                    </div>
                </div>
                
                <!-- Detailed Rankings Table -->
                <div class="detailed-stats">
                    <h3><i class="fas fa-list-ol"></i> Detailed Object Rankings</h3>
                    <div class="stats-table">
                        ${objectRankings.map((obj, index) => `
                            <div class="stats-row ${index === 0 ? 'highlight' : ''}" onclick="showObjectFromSearch(${currentTopicId}, ${obj.id})" style="cursor: pointer;">
                                <span class="stats-label">
                                    <strong>#${index + 1}</strong> ${escapeHtml(obj.name)}
                                    ${obj.avgRating > 0 ? `<span style="color: #ffd700; margin-left: 0.5rem;">${renderStars(obj.avgRating)}</span>` : ''}
                                </span>
                                <span class="stats-value">
                                    ${obj.avgRating > 0 ? obj.avgRating.toFixed(2) : 'No ratings'} 
                                    (${obj.totalRatings} rating${obj.totalRatings !== 1 ? 's' : ''})
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Most Active Objects -->
                <div class="detailed-stats">
                    <h3><i class="fas fa-fire"></i> Most Active Objects</h3>
                    <div class="stats-table">
                        ${mostActiveObjects.slice(0, 10).map((obj, index) => `
                            <div class="stats-row" onclick="showObjectFromSearch(${currentTopicId}, ${obj.id})" style="cursor: pointer;">
                                <span class="stats-label">
                                    <strong>#${index + 1}</strong> ${escapeHtml(obj.name)}
                                </span>
                                <span class="stats-value">
                                    ${obj.totalRatings} rating${obj.totalRatings !== 1 ? 's' : ''} 
                                    (${obj.ratingsWithReviews} review${obj.ratingsWithReviews !== 1 ? 's' : ''})
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Summary Statistics -->
                <div class="detailed-stats">
                    <h3><i class="fas fa-info-circle"></i> Summary Statistics</h3>
                    <div class="stats-table">
                        <div class="stats-row">
                            <span class="stats-label">Total Objects:</span>
                            <span class="stats-value">${totalObjects}</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">Total Ratings:</span>
                            <span class="stats-value">${totalRatings}</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">Average Ratings per Object:</span>
                            <span class="stats-value">${totalObjects > 0 ? (totalRatings / totalObjects).toFixed(1) : '0'}</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">Objects with Ratings:</span>
                            <span class="stats-value">${objectRankings.filter(obj => obj.totalRatings > 0).length} of ${totalObjects}</span>
                        </div>
                        <div class="stats-row">
                            <span class="stats-label">Review Coverage:</span>
                            <span class="stats-value">${totalRatings > 0 ? Math.round((ratingsWithReviews / totalRatings) * 100) : 0}% of ratings have reviews</span>
                        </div>
                        <div class="stats-row highlight">
                            <span class="stats-label">Most Common Rating:</span>
                            <span class="stats-value">${totalRatings > 0 ? (ratingCounts.indexOf(Math.max(...ratingCounts)) + 1) + ' Stars' : 'N/A'}</span>
                        </div>
                        ${mostRecentRating ? `
                            <div class="stats-row">
                                <span class="stats-label">Latest Activity:</span>
                                <span class="stats-value">${formatDate(mostRecentRating)}</span>
                            </div>
                        ` : ''}
                        ${oldestRating ? `
                            <div class="stats-row">
                                <span class="stats-label">First Rating:</span>
                                <span class="stats-value">${formatDate(oldestRating)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Create Object Rankings Chart
        const rankingsCtx = document.getElementById('topic-rankings-chart').getContext('2d');
        const topObjects = objectRankings.slice(0, 10); // Top 10 objects
        new Chart(rankingsCtx, {
            type: 'bar',
            data: {
                labels: topObjects.map(obj => obj.name.length > 20 ? obj.name.substring(0, 20) + '...' : obj.name),
                datasets: [{
                    label: 'Average Rating',
                    data: topObjects.map(obj => obj.avgRating),
                    backgroundColor: topObjects.map((_, index) => {
                        const colors = ['#ffd700', '#c0c0c0', '#cd7f32', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
                        return colors[index] || '#6b7280';
                    }),
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const obj = topObjects[context.dataIndex];
                                return `${obj.avgRating.toFixed(2)} stars (${obj.totalRatings} rating${obj.totalRatings !== 1 ? 's' : ''})`;
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        min: 0, 
                        max: 5, 
                        ticks: { stepSize: 1 },
                        title: { display: true, text: 'Average Rating' }
                    },
                    x: { 
                        ticks: { maxRotation: 45 },
                        title: { display: true, text: 'Objects' }
                    }
                }
            }
        });
        
        // Create Rating Distribution Chart
        const ratingsBarCtx = document.getElementById('topic-ratings-bar-chart').getContext('2d');
        new Chart(ratingsBarCtx, {
            type: 'bar',
            data: {
                labels: ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'],
                datasets: [{
                    label: 'Number of Ratings',
                    data: ratingCounts,
                    backgroundColor: ['#f87171', '#fbbf24', '#facc15', '#34d399', '#60a5fa'],
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = ratingCounts.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? Math.round((context.parsed.y / total) * 100) : 0;
                                return `${context.parsed.y} ratings (${percentage}%)`;
                            }
                        }
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        precision: 0,
                        title: { display: true, text: 'Number of Ratings' }
                    },
                    x: {
                        title: { display: true, text: 'Rating' }
                    }
                }
            }
        });
        
        // Create Activity Distribution Chart
        const activityCtx = document.getElementById('topic-activity-chart').getContext('2d');
        const activityData = mostActiveObjects.slice(0, 8).map(obj => obj.totalRatings);
        const activityLabels = mostActiveObjects.slice(0, 8).map(obj => obj.name.length > 15 ? obj.name.substring(0, 15) + '...' : obj.name);
        
        new Chart(activityCtx, {
            type: 'doughnut',
            data: {
                labels: activityLabels,
                datasets: [{
                    data: activityData,
                    backgroundColor: [
                        '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', 
                        '#ef4444', '#06b6d4', '#84cc16', '#f97316'
                    ],
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 15, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = activityData.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                                return `${context.label}: ${context.parsed} ratings (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '50%'
            }
        });
        
        // Create Timeline Chart
        const timelineCtx = document.getElementById('topic-timeline-chart').getContext('2d');
        
        // Group ratings by day for the last 30 days
        const dailyRatings = {};
        const last30Days = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            last30Days.push(dateStr);
            dailyRatings[dateStr] = 0;
        }
        
        allRatings.forEach(rating => {
            const dateStr = new Date(rating.created_at).toISOString().split('T')[0];
            if (dailyRatings.hasOwnProperty(dateStr)) {
                dailyRatings[dateStr]++;
            }
        });
        
        new Chart(timelineCtx, {
            type: 'line',
            data: {
                labels: last30Days.map(date => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [{
                    label: 'Ratings per Day',
                    data: last30Days.map(date => dailyRatings[date]),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        precision: 0,
                        title: { display: true, text: 'Number of Ratings' }
                    },
                    x: { 
                        title: { display: true, text: 'Date' }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
        
    } catch (error) {
        console.error('Error rendering topic statistics:', error);
        container.innerHTML = '<div class="error">Failed to load statistics: ' + error.message + '</div>';
    }
}

async function updateProposalCount() {
    try {
        const proposals = await fetchProposals('pending');
        const count = proposals.length;
        const proposalCountElem = document.getElementById('proposal-count');
        if (proposalCountElem) {
            proposalCountElem.textContent = count;
            proposalCountElem.style.display = count > 0 ? 'inline' : 'none';
        }
    } catch (error) {
        console.error('Error updating proposal count:', error);
        const proposalCountElem = document.getElementById('proposal-count');
        if (proposalCountElem) {
            proposalCountElem.style.display = 'none';
        }
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// --- Tag Management with Backend API ---
async function fetchTags() {
    const res = await fetch(BACKEND_URL + '/api/tags');
    if (!res.ok) throw new Error('Failed to fetch tags');
    return await res.json();
}

async function assignTagsToObject(objectId, tags) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}/tags`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ tags })
    });
    if (!res.ok) throw new Error('Failed to assign tags');
    return await res.json();
}

async function fetchObjectTags(objectId) {
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}/tags`);
    if (!res.ok) throw new Error('Failed to fetch object tags');
    return await res.json();
}

// Example usage in UI (update as needed):
async function renderObjectTags() {
    const tagsContainer = document.getElementById('object-tags-display');
    try {
        const tags = await fetchObjectTags(currentObjectId);
        if (tags.length > 0) {
            tagsContainer.innerHTML = `
                <div class="tags">
                    ${tags.map(tag => `<span class="tag clickable" onclick="searchByTag('${escapeHtml(tag.name)}', event)">${escapeHtml(tag.name)}</span>`).join('')}
                </div>
            `;
        } else {
            tagsContainer.innerHTML = '';
        }
    } catch (e) {
        tagsContainer.innerHTML = '<div class="error">Failed to load tags.</div>';
    }
}

async function renderTopicTags() {
    const tagsContainer = document.getElementById('topic-tags-display');
    try {
        const tags = await fetchTopicTags(currentTopicId);
        if (tags.length > 0) {
            tagsContainer.innerHTML = `
                <div class="tags">
                    ${tags.map(tag => `<span class="tag clickable" onclick="searchByTag('${escapeHtml(tag.name)}', event)">${escapeHtml(tag.name)}</span>`).join('')}
                </div>
            `;
        } else {
            tagsContainer.innerHTML = '';
        }
    } catch (e) {
        tagsContainer.innerHTML = '<div class="error">Failed to load topic tags.</div>';
    }
}

// --- Moderation Proposals with Backend API ---
async function fetchProposals(status = '') {
    const token = getAuthToken();
    let url = BACKEND_URL + '/api/moderation/proposals';
    if (status) url += '?status=' + encodeURIComponent(status);
    const res = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to fetch proposals');
    return await res.json();
}

async function createProposal(type, target_type, target_id, new_value, reason) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + '/api/moderation/proposals', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ type, target_type, target_id, new_value, reason })
    });
    if (!res.ok) throw new Error('Failed to create proposal');
    return await res.json();
}

async function voteProposal(proposalId, vote) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/moderation/proposals/${proposalId}/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ vote })
    });
    if (!res.ok) throw new Error('Failed to vote on proposal');
    return await res.json();
}

async function executeProposal(proposalId) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/moderation/proposals/${proposalId}/execute`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to execute proposal');
    return await res.json();
}

// Helper function to get current state of proposal target
async function getProposalTargetCurrentState(proposal) {
    try {
        if (proposal.target_type === 'topic') {
            const topic = await fetchTopic(proposal.target_id);
            if (!topic) return null;
            const tags = await fetchTopicTags(proposal.target_id);
            return {
                name: topic.name,
                tags: tags.map(tag => tag.name)
            };
        } else if (proposal.target_type === 'object') {
            const object = await fetchObject(proposal.target_id);
            if (!object) return null;
            const tags = await fetchObjectTags(proposal.target_id);
            return {
                name: object.name,
                tags: tags.map(tag => tag.name)
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching target state:', error);
        return null;
    }
}

// Example: render proposals page using API
document.renderProposals = async function renderProposals() {
    const proposalsList = document.getElementById('proposals-list');
    proposalsList.innerHTML = '<div>Loading...</div>';
    try {
        const proposals = await fetchProposals('pending');
        if (proposals.length === 0) {
            proposalsList.innerHTML = `<div class="empty-state"><h3>No pending proposals</h3></div>`;
            return;
        }
        
        // Render each proposal with current state comparison
        const proposalElements = [];
        for (const p of proposals) {
            const isAdmin = currentUser && currentUser.isAdmin;
            const currentState = await getProposalTargetCurrentState(p);
            
            let changeDisplay = '';
            if (p.type === 'edit' && p.new_value && currentState) {
                try {
                    const proposedChanges = JSON.parse(p.new_value);
                    
                    // Show name change if different
                    if (proposedChanges.name && proposedChanges.name !== currentState.name) {
                        changeDisplay += `
                            <div class="proposal-change">
                                <div class="original-content">
                                    <strong>Current Name:</strong><br>
                                    "${escapeHtml(currentState.name)}"
                                </div>
                                <div class="change-arrow">→</div>
                                <div class="proposed-content">
                                    <strong>Proposed Name:</strong><br>
                                    "${escapeHtml(proposedChanges.name)}"
                                </div>
                            </div>
                        `;
                    }
                    
                    // Show tag changes if different
                    if (proposedChanges.tags && JSON.stringify(proposedChanges.tags.sort()) !== JSON.stringify(currentState.tags.sort())) {
                        changeDisplay += `
                            <div class="proposal-change">
                                <div class="original-content">
                                    <strong>Current Tags:</strong><br>
                                    ${currentState.tags.length > 0 ? currentState.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ') : '<em>No tags</em>'}
                                </div>
                                <div class="change-arrow">→</div>
                                <div class="proposed-content">
                                    <strong>Proposed Tags:</strong><br>
                                    ${proposedChanges.tags.length > 0 ? proposedChanges.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ') : '<em>No tags</em>'}
                                </div>
                            </div>
                        `;
                    }
                } catch (error) {
                    // Fallback for non-JSON new_value
                    changeDisplay = `
                        <div class="proposal-change">
                            <div class="original-content">
                                <strong>Current:</strong><br>
                                "${escapeHtml(currentState.name)}"
                            </div>
                            <div class="change-arrow">→</div>
                            <div class="proposed-content">
                                <strong>Proposed:</strong><br>
                                "${escapeHtml(p.new_value)}"
                            </div>
                        </div>
                    `;
                }
            } else if (p.type === 'delete' && currentState) {
                changeDisplay = `
                    <div class="proposal-change">
                        <div class="original-content">
                            <strong>Current ${p.target_type}:</strong><br>
                            "${escapeHtml(currentState.name)}"<br>
                            ${currentState.tags.length > 0 ? `Tags: ${currentState.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join(' ')}` : ''}
                        </div>
                        <div class="change-arrow">→</div>
                        <div class="proposed-content" style="background: #fed7d7; border-left-color: #e53e3e;">
                            <strong>Will be deleted</strong><br>
                            <em>This ${p.target_type} will be permanently removed</em>
                        </div>
                    </div>
                `;
            }
            
            proposalElements.push(`
                <div class="proposal-item">
                    <div class="proposal-header">
                        <span class="proposal-type">${escapeHtml(p.type.toUpperCase())} ${escapeHtml(p.target_type.toUpperCase())}</span>
                        <div class="proposal-user">Proposed by: ${escapeHtml(p.proposer_username || 'Unknown')}</div>
                    </div>
                    <div class="proposal-content">
                        <div><strong>Target ID:</strong> ${p.target_id}</div>
                        ${p.reason ? `<div><strong>Reason:</strong> ${escapeHtml(p.reason)}</div>` : ''}
                        <div><strong>Created:</strong> ${formatDate(p.created_at)}</div>
                        ${changeDisplay}
                        ${!currentState ? `<div class="error-notice" style="color: #e53e3e; font-style: italic;">⚠️ Target ${p.target_type} not found - may have been deleted</div>` : ''}
                    </div>
                    <div class="proposal-voting">
                        <div class="voting-actions">
                            <button class="btn btn-small vote-agree" onclick="voteProposalUI('${p.id}',1)">
                                <i class="fas fa-thumbs-up"></i> Approve
                            </button>
                            <button class="btn btn-small vote-disagree" onclick="voteProposalUI('${p.id}',0)">
                                <i class="fas fa-thumbs-down"></i> Reject
                            </button>
                            <button class="btn btn-small btn-secondary" onclick="executeProposalUI('${p.id}')">
                                <i class="fas fa-gavel"></i> Execute
                            </button>
                            ${isAdmin ? `
                                <button class="btn btn-small btn-primary" onclick="adminApproveProposal('${p.id}')">
                                    <i class="fas fa-check-circle"></i> Admin Approve
                                </button>
                                <button class="btn btn-small btn-danger" onclick="adminVetoProposal('${p.id}')">
                                    <i class="fas fa-times-circle"></i> Admin Reject
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `);
        }
        
        proposalsList.innerHTML = proposalElements.join('');
    } catch (e) {
        proposalsList.innerHTML = '<div class="error">Failed to load proposals.</div>';
    }
}

window.voteProposalUI = async function(proposalId, vote) {
    try {
        await voteProposal(proposalId, vote);
        showNotification('Vote submitted!');
        document.renderProposals();
        updateProposalCount();
    } catch (e) {
        alert('Failed to vote: ' + e.message);
    }
}

window.executeProposalUI = async function(proposalId) {
    try {
        await executeProposal(proposalId);
        showNotification('Proposal executed!');
        document.renderProposals();
        updateProposalCount();
    } catch (e) {
        alert('Failed to execute proposal: ' + e.message);
    }
}

// Object editing functions
async function editObject() {
    if (!currentUser || !currentObjectId) return;
    
    try {
        const object = await fetchObject(currentObjectId);
        if (!object) {
            alert('Object not found');
            return;
        }
        
        const newName = prompt('Enter new object name:', object.name);
        if (!newName || newName.trim() === '') return;
        
        const currentTags = await fetchObjectTags(currentObjectId);
        const currentTagNames = currentTags.map(tag => tag.name);
        const newTagsStr = prompt('Enter tags (comma-separated):', currentTagNames.join(', '));
        if (newTagsStr === null) return;
        
        const newTags = parseAndCleanTags(newTagsStr);
        
        if (newName.trim() === object.name && JSON.stringify(newTags.sort()) === JSON.stringify(currentTagNames.sort())) {
            return; // No changes
        }
        
        await updateObject(currentObjectId, newName.trim());
        if (newTags.length > 0 || currentTagNames.length > 0) {
            await assignTagsToObject(currentObjectId, newTags);
        }
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        showNotification('Object updated successfully');
        await showObjectPage(currentObjectId); // Refresh the page
    } catch (error) {
        alert('Failed to update object: ' + error.message);
    }
}

async function deleteObjectUI() {
    if (!currentUser || !currentObjectId) return;
    
    try {
        const object = await fetchObject(currentObjectId);
        if (!object) {
            alert('Object not found');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete the object "${object.name}"? This will also delete all ratings for this object.`)) return;
        
        await deleteObject(currentObjectId);
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        await showTopicPage(currentTopicId); // Go back to topic page
        showNotification('Object deleted successfully!');
    } catch (error) {
        alert('Failed to delete object: ' + error.message);
    }
}

// Topic editing functions
async function editTopic() {
    if (!currentUser || !currentTopicId) return;
    
    try {
        const topic = await fetchTopic(currentTopicId);
        const tags = await fetchTopicTags(currentTopicId);
        
        const newName = prompt('Enter new topic name:', topic.name);
        if (!newName || newName.trim() === '') return;
        
        const currentTagNames = tags.map(tag => tag.name);
        const newTagsStr = prompt('Enter tags (comma-separated):', currentTagNames.join(', '));
        if (newTagsStr === null) return;
        
        const newTags = parseAndCleanTags(newTagsStr);
        
        await updateTopic(currentTopicId, newName.trim(), newTags);
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        // Refresh the page
        await showTopicPage(currentTopicId);
        showNotification('Topic updated successfully!');
    } catch (error) {
        alert('Failed to update topic: ' + error.message);
    }
}

async function deleteTopicUI() {
    if (!currentUser || !currentTopicId) return;
    
    try {
        const topic = await fetchTopic(currentTopicId);
        if (!confirm(`Are you sure you want to delete the topic "${topic.name}"? This will also delete all objects and ratings within it.`)) return;
        
        await deleteTopic(currentTopicId);
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        showHomePage();
        showNotification('Topic deleted successfully!');
    } catch (error) {
        alert('Failed to delete topic: ' + error.message);
    }
}

// Ensure UI functions are globally available for HTML onclick
window.showAddTopicForm = showAddTopicForm;
window.hideAddTopicForm = hideAddTopicForm;
window.addTopic = addTopic;
window.editTopic = editTopic;
window.deleteTopic = deleteTopicUI;
window.showAddObjectForm = showAddObjectForm;
window.hideAddObjectForm = hideAddObjectForm;
window.addObject = addObject;
window.editObject = editObject;
window.deleteObject = deleteObjectUI;
window.showUserProfilePage = showUserProfilePage;
window.rateUserUI = rateUserUI;
window.removeUserRatingUI = removeUserRatingUI;
window.showObjectStatsPage = showObjectStatsPage;
window.showTopicStatsPage = showTopicStatsPage;
window.showUserSpacePage = showUserSpacePage;
window.updateUserInfo = updateUserInfo;
// Add more as needed for other UI functions referenced in HTML

// UI functions for showing/hiding add topic/object forms
function showAddTopicForm() {
    document.getElementById('add-topic-form').style.display = 'block';
    document.getElementById('topic-name').focus();
}
function hideAddTopicForm() {
    document.getElementById('add-topic-form').style.display = 'none';
    document.getElementById('topic-name').value = '';
    document.getElementById('topic-tags').value = '';
}
function showAddObjectForm() {
    document.getElementById('add-object-form').style.display = 'block';
    document.getElementById('object-name').focus();
}
function hideAddObjectForm() {
    document.getElementById('add-object-form').style.display = 'none';
    document.getElementById('object-name').value = '';
    document.getElementById('object-tags').value = '';
}

// Content Filter Management Functions
async function renderAdminContentFilter() {
    const container = document.getElementById('admin-content-filter-content');
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/content-filter', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch content filter data');
        }
        
        const filterData = await response.json();
        
        let html = `
            <div class="content-filter-management">
                <div class="content-filter-test">
                    <h4>Test Content</h4>
                    <textarea id="content-test-input" placeholder="Enter text to test against content filter..." rows="3" style="width: 100%; margin-bottom: 10px;"></textarea>
                    <button class="btn btn-primary" onclick="testContent()">Test Content</button>
                    <div id="content-test-result" style="margin-top: 10px;"></div>
                </div>
                
                <div class="content-filter-categories" style="margin-top: 30px;">
                    <h4>Filter Categories</h4>
        `;
        
        for (const [category, data] of Object.entries(filterData)) {
            html += `
                <div class="filter-category" style="margin-bottom: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 5px;">
                    <h5 style="margin: 0 0 10px 0; text-transform: capitalize;">${category}</h5>
                    <p style="margin: 0 0 10px 0; color: #666;">
                        ${data.count} words | Preview: ${data.words.join(', ')}${data.count > 10 ? '...' : ''}
                    </p>
                    <div class="filter-category-actions">
                        <button class="btn btn-secondary btn-small" onclick="viewCategoryWords('${category}')">View All</button>
                        <button class="btn btn-primary btn-small" onclick="addWordsToCategory('${category}')">Add Words</button>
                        <button class="btn btn-danger btn-small" onclick="removeWordsFromCategory('${category}')">Remove Words</button>
                    </div>
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div class="error">Failed to load content filter: ' + error.message + '</div>';
    }
}

async function testContent() {
    const input = document.getElementById('content-test-input');
    const result = document.getElementById('content-test-result');
    const text = input.value.trim();
    
    if (!text) {
        result.innerHTML = '<div class="error">Please enter some text to test</div>';
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/content-filter/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ text })
        });
        
        if (!response.ok) {
            throw new Error('Failed to test content');
        }
        
        const testResult = await response.json();
        
        let html = `
            <div class="content-test-result">
                <h5>Test Result: ${testResult.isClean ? '<span style="color: green;">✓ Clean</span>' : '<span style="color: red;">✗ Contains Sensitive Content</span>'}</h5>
        `;
        
        if (!testResult.isClean) {
            html += `
                <p><strong>Message:</strong> ${testResult.message}</p>
                <p><strong>Violations:</strong></p>
                <ul>
            `;
            testResult.violations.forEach(violation => {
                html += `<li><strong>${violation.category}:</strong> ${violation.matches.join(', ')} (${violation.count} matches)</li>`;
            });
            html += '</ul>';
        }
        
        html += `
                <p><strong>Sanitized:</strong> ${escapeHtml(testResult.sanitized)}</p>
            </div>
        `;
        
        result.innerHTML = html;
    } catch (error) {
        result.innerHTML = '<div class="error">Failed to test content: ' + error.message + '</div>';
    }
}

async function viewCategoryWords(category) {
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + `/api/admin/content-filter/${category}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch category words');
        }
        
        const data = await response.json();
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Words in "${category}" category</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p><strong>Total words:</strong> ${data.words.length}</p>
                    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; background: #f9f9f9;">
                        ${data.words.map(word => `<span style="display: inline-block; background: #e2e8f0; padding: 2px 6px; margin: 2px; border-radius: 3px; font-size: 0.9em;">${escapeHtml(word)}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    } catch (error) {
        alert('Failed to view category words: ' + error.message);
    }
}

async function addWordsToCategory(category) {
    const words = prompt(`Enter words to add to "${category}" category (comma-separated):`);
    if (!words) return;
    
    const wordList = words.split(',').map(w => w.trim()).filter(w => w.length > 0);
    if (wordList.length === 0) {
        alert('No valid words entered');
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + `/api/admin/content-filter/${category}/words`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ words: wordList })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add words');
        }
        
        const result = await response.json();
        showNotification(`Added ${result.added} words to ${category} category. Total: ${result.total} words.`);
        await renderAdminContentFilter();
    } catch (error) {
        alert('Failed to add words: ' + error.message);
    }
}

async function removeWordsFromCategory(category) {
    const words = prompt(`Enter words to remove from "${category}" category (comma-separated):`);
    if (!words) return;
    
    const wordList = words.split(',').map(w => w.trim()).filter(w => w.length > 0);
    if (wordList.length === 0) {
        alert('No valid words entered');
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + `/api/admin/content-filter/${category}/words`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ words: wordList })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to remove words');
        }
        
        const result = await response.json();
        showNotification(`Removed ${result.removed} words from ${category} category. Total: ${result.total} words.`);
        await renderAdminContentFilter();
    } catch (error) {
        alert('Failed to remove words: ' + error.message);
    }
}

// Make content filter functions globally available
window.testContent = testContent;
window.viewCategoryWords = viewCategoryWords;
window.addWordsToCategory = addWordsToCategory;
window.removeWordsFromCategory = removeWordsFromCategory;

// Blocked Email Management Functions
async function renderAdminBlockedEmails() {
    const container = document.getElementById('admin-blocked-emails-content');
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/blocked-emails', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch blocked emails');
        }
        
        const data = await response.json();
        
        let html = `
            <div class="blocked-emails-management">
                <div class="blocked-emails-actions">
                    <h4>Add New Blocked Email</h4>
                    <div class="add-email-form">
                        <input type="email" id="new-blocked-email" placeholder="Enter email address to block" style="width: 300px; margin-right: 10px;">
                        <button class="btn btn-danger" onclick="addBlockedEmail()">Block Email</button>
                    </div>
                </div>
                
                <div class="blocked-emails-test" style="margin: 20px 0;">
                    <h4>Test Email</h4>
                    <div class="test-email-form">
                        <input type="email" id="test-email-input" placeholder="Enter email to test" style="width: 300px; margin-right: 10px;">
                        <button class="btn btn-secondary" onclick="testEmailBlocked()">Test Email</button>
                    </div>
                    <div id="test-email-result" style="margin-top: 10px;"></div>
                </div>
                
                <div class="blocked-emails-list">
                    <h4>Blocked Emails (${data.count})</h4>
        `;
        
        if (data.blockedEmails.length === 0) {
            html += '<p style="color: #666;">No emails are currently blocked.</p>';
        } else {
            html += `
                <div class="blocked-emails-grid" style="display: grid; gap: 10px;">
            `;
            
            data.blockedEmails.forEach(email => {
                html += `
                    <div class="blocked-email-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #ddd; border-radius: 5px; background: #f9f9f9;">
                        <span style="font-family: monospace; color: #333;">${escapeHtml(email)}</span>
                        <button class="btn btn-small btn-secondary" onclick="removeBlockedEmail('${escapeHtml(email)}')">Unblock</button>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        html += `
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div class="error">Failed to load blocked emails: ' + error.message + '</div>';
    }
}

async function addBlockedEmail() {
    const input = document.getElementById('new-blocked-email');
    const email = input.value.trim();
    
    if (!email) {
        alert('Please enter an email address');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/blocked-emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to block email');
        }
        
        const result = await response.json();
        showNotification(`Email ${email} has been blocked successfully`);
        input.value = '';
        await renderAdminBlockedEmails();
    } catch (error) {
        alert('Failed to block email: ' + error.message);
    }
}

async function removeBlockedEmail(email) {
    if (!confirm(`Are you sure you want to unblock "${email}"?`)) {
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/blocked-emails', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to unblock email');
        }
        
        const result = await response.json();
        showNotification(`Email ${email} has been unblocked successfully`);
        await renderAdminBlockedEmails();
    } catch (error) {
        alert('Failed to unblock email: ' + error.message);
    }
}

async function testEmailBlocked() {
    const input = document.getElementById('test-email-input');
    const result = document.getElementById('test-email-result');
    const email = input.value.trim();
    
    if (!email) {
        result.innerHTML = '<div class="error">Please enter an email address to test</div>';
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/blocked-emails/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            throw new Error('Failed to test email');
        }
        
        const testResult = await response.json();
        
        let html = `
            <div class="email-test-result">
                <h5>Test Result for: ${escapeHtml(testResult.email)}</h5>
                <p><strong>Status:</strong> ${testResult.isBlocked ? '<span style="color: red;">✗ BLOCKED</span>' : '<span style="color: green;">✓ NOT BLOCKED</span>'}</p>
                <p><strong>Message:</strong> ${testResult.message}</p>
            </div>
        `;
        
        result.innerHTML = html;
    } catch (error) {
        result.innerHTML = '<div class="error">Failed to test email: ' + error.message + '</div>';
    }
}

// Make blocked email functions globally available
window.addBlockedEmail = addBlockedEmail;
window.removeBlockedEmail = removeBlockedEmail;
window.testEmailBlocked = testEmailBlocked;

// Email Domain Restriction Management Functions
async function renderAdminDomainRestrictions() {
    const container = document.getElementById('admin-domain-restrictions-content');
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/domain-restrictions', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch domain restrictions');
        }
        
        const settings = await response.json();
        
        let html = `
            <div class="domain-restrictions-management">
                <!-- Current Status -->
                <div class="domain-restrictions-status">
                    <h4>Current Status</h4>
                    <div class="status-display" style="padding: 15px; border: 2px solid ${settings.enabled ? '#dc2626' : '#16a34a'}; border-radius: 8px; background: ${settings.enabled ? '#fef2f2' : '#f0fdf4'};">
                        <div style="display: flex; align-items: center; margin-bottom: 10px;">
                            <span style="font-size: 18px; margin-right: 8px;">${settings.enabled ? '🔒' : '🔓'}</span>
                            <strong style="color: ${settings.enabled ? '#dc2626' : '#16a34a'};">
                                ${settings.enabled ? 'RESTRICTED' : 'UNRESTRICTED'}
                            </strong>
                        </div>
                        ${settings.enabled ? `
                            <p style="margin: 5px 0;"><strong>Allowed domains:</strong> ${settings.allowedDomains.join(', ')}</p>
                            <p style="margin: 5px 0; font-style: italic;">"${settings.message}"</p>
                        ` : `
                            <p style="margin: 5px 0;">All email domains are currently allowed for registration.</p>
                        `}
                    </div>
                </div>
                
                <!-- Quick Toggle -->
                <div class="domain-restrictions-toggle" style="margin: 20px 0;">
                    <h4>Quick Toggle</h4>
                    <button class="btn ${settings.enabled ? 'btn-danger' : 'btn-success'}" onclick="toggleDomainRestrictions(${!settings.enabled})">
                        ${settings.enabled ? '🔓 Disable Restrictions' : '🔒 Enable Restrictions'}
                    </button>
                    <p style="color: #666; font-size: 14px; margin-top: 5px;">
                        ${settings.enabled ? 'This will allow all email domains to register' : 'This will restrict registration to .edu and .edu.cn domains'}
                    </p>
                </div>
                
                <!-- Test Email -->
                <div class="domain-restrictions-test" style="margin: 20px 0;">
                    <h4>Test Email Domain</h4>
                    <div class="test-email-form">
                        <input type="email" id="test-domain-email" placeholder="Enter email to test" style="width: 300px; margin-right: 10px;">
                        <button class="btn btn-secondary" onclick="testEmailDomain()">Test Email</button>
                    </div>
                    <div id="test-domain-result" style="margin-top: 10px;"></div>
                </div>
                
                <!-- Advanced Settings -->
                <div class="domain-restrictions-advanced" style="margin: 20px 0;">
                    <h4>Advanced Settings</h4>
                    <div class="advanced-settings-form" style="border: 1px solid #ddd; padding: 15px; border-radius: 5px; background: #f9f9f9;">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="restriction-enabled" style="display: block; font-weight: bold; margin-bottom: 5px;">Enable Restrictions:</label>
                            <select id="restriction-enabled" style="width: 200px;">
                                <option value="true" ${settings.enabled ? 'selected' : ''}>Enabled</option>
                                <option value="false" ${!settings.enabled ? 'selected' : ''}>Disabled</option>
                            </select>
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="allowed-domains" style="display: block; font-weight: bold; margin-bottom: 5px;">Allowed Domains:</label>
                            <input type="text" id="allowed-domains" placeholder="e.g., .edu, .edu.cn, .ac.uk" 
                                   value="${settings.allowedDomains.join(', ')}" style="width: 400px;">
                            <p style="color: #666; font-size: 12px; margin-top: 2px;">Enter domains separated by commas. Each domain must start with a dot.</p>
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label for="restriction-message" style="display: block; font-weight: bold; margin-bottom: 5px;">Restriction Message:</label>
                            <textarea id="restriction-message" rows="3" style="width: 100%;" placeholder="Message shown to users when their email domain is not allowed">${settings.message}</textarea>
                        </div>
                        
                        <button class="btn btn-primary" onclick="updateDomainRestrictions()">Update Settings</button>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div class="error">Failed to load domain restrictions: ' + error.message + '</div>';
    }
}

async function toggleDomainRestrictions(enabled) {
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/domain-restrictions', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ enabled })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to toggle domain restrictions');
        }
        
        const result = await response.json();
        showNotification(`Domain restrictions ${enabled ? 'enabled' : 'disabled'} successfully`);
        await renderAdminDomainRestrictions();
    } catch (error) {
        alert('Failed to toggle domain restrictions: ' + error.message);
    }
}

async function updateDomainRestrictions() {
    const enabled = document.getElementById('restriction-enabled').value === 'true';
    const domainsText = document.getElementById('allowed-domains').value.trim();
    const message = document.getElementById('restriction-message').value.trim();
    
    if (!message) {
        alert('Please enter a restriction message');
        return;
    }
    
    // Parse and validate domains
    let allowedDomains = [];
    if (domainsText) {
        allowedDomains = domainsText.split(',').map(d => d.trim()).filter(d => d);
        
        // Validate each domain
        for (const domain of allowedDomains) {
            if (!domain.startsWith('.')) {
                alert(`Invalid domain "${domain}". Domains must start with a dot (e.g., ".edu")`);
                return;
            }
        }
    }
    
    if (enabled && allowedDomains.length === 0) {
        alert('Please enter at least one allowed domain when restrictions are enabled');
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/domain-restrictions', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ enabled, allowedDomains, message })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update domain restrictions');
        }
        
        const result = await response.json();
        showNotification('Domain restriction settings updated successfully');
        await renderAdminDomainRestrictions();
    } catch (error) {
        alert('Failed to update domain restrictions: ' + error.message);
    }
}

async function testEmailDomain() {
    const input = document.getElementById('test-domain-email');
    const result = document.getElementById('test-domain-result');
    const email = input.value.trim();
    
    if (!email) {
        result.innerHTML = '<div class="error">Please enter an email address to test</div>';
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        result.innerHTML = '<div class="error">Please enter a valid email address</div>';
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/domain-restrictions/test', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            throw new Error('Failed to test email domain');
        }
        
        const testResult = await response.json();
        
        let html = `
            <div class="domain-test-result">
                <h5>Test Result for: ${escapeHtml(testResult.email)}</h5>
                <p><strong>Status:</strong> ${testResult.allowed ? '<span style="color: green;">✓ ALLOWED</span>' : '<span style="color: red;">✗ BLOCKED</span>'}</p>
                <p><strong>Message:</strong> ${testResult.message}</p>
                
                <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 14px;">
                    <strong>Current Settings:</strong><br>
                    Restrictions: ${testResult.currentSettings.enabled ? 'Enabled' : 'Disabled'}<br>
                    ${testResult.currentSettings.enabled ? `Allowed domains: ${testResult.currentSettings.allowedDomains.join(', ')}` : 'All domains allowed'}
                </div>
            </div>
        `;
        
        result.innerHTML = html;
    } catch (error) {
        result.innerHTML = '<div class="error">Failed to test email domain: ' + error.message + '</div>';
    }
}

// Make domain restriction functions globally available
window.toggleDomainRestrictions = toggleDomainRestrictions;
window.updateDomainRestrictions = updateDomainRestrictions;
window.testEmailDomain = testEmailDomain;

// Add debounced search and pagination support
let searchTimeout;
let currentSearchPage = 1;
let searchPagination = null;
const SEARCH_DEBOUNCE_DELAY = 300;
const apiCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Enhanced API fetch with caching
async function cachedFetch(url, options = {}) {
    const cacheKey = `${url}${JSON.stringify(options)}`;
    const cached = apiCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(currentUser?.token && { 'Authorization': `Bearer ${currentUser.token}` }),
            ...options.headers
        },
        ...options
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Cache GET requests only
    if (!options.method || options.method === 'GET') {
        apiCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        if (apiCache.size > 100) {
            const oldestEntries = Array.from(apiCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
                .slice(0, 20);
            oldestEntries.forEach(([key]) => apiCache.delete(key));
        }
    }
    
    return data;
}

// Debounced search function
function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = document.getElementById('search-input').value.trim();
        if (query.length >= 2) {
            performOptimizedSearch();
        } else if (query.length === 0) {
            // Clear search results if query is empty
            currentSearchResults = { topics: [], objects: [] };
            if (currentPage === 'search') {
                showHomePage();
            }
        }
    }, SEARCH_DEBOUNCE_DELAY);
}

// Enhanced search with server-side processing
async function performOptimizedSearch(page = 1) {
    const query = document.getElementById('search-input').value.trim();
    const searchType = document.getElementById('search-type').value;
    const tagInput = document.getElementById('tag-search-input').value.trim();
    const tagLogic = document.getElementById('tag-search-logic').value;
    
    if (!query && !tagInput) {
        alert('Please enter a search term or tag filters');
        return;
    }
    
    currentSearchPage = page;
    
    try {
        // Show loading state
        if (page === 1) {
            await showSearchPage(query, searchType, tagInput ? tagInput.split(/[,，;；、]/).map(t => t.trim()).filter(t => t) : null, tagLogic);
        }
        
        // Build search URL
        const searchParams = new URLSearchParams({
            q: query || '',
            type: searchType,
            page: page.toString(),
            limit: '20'
        });
        
        if (tagInput) {
            searchParams.append('tags', tagInput);
            searchParams.append('tagLogic', tagLogic);
        }
        
        const searchData = await cachedFetch(`${API_BASE}/search?${searchParams}`);
        
        if (page === 1) {
            currentSearchResults = searchData;
            searchPagination = searchData.topics?.pagination || searchData.objects?.pagination;
        } else {
            // Append results for pagination
            if (searchData.topics) {
                currentSearchResults.topics.items = [
                    ...(currentSearchResults.topics.items || []),
                    ...searchData.topics.items
                ];
                currentSearchResults.topics.pagination = searchData.topics.pagination;
            }
            if (searchData.objects) {
                currentSearchResults.objects.items = [
                    ...(currentSearchResults.objects.items || []),
                    ...searchData.objects.items
                ];
                currentSearchResults.objects.pagination = searchData.objects.pagination;
            }
        }
        
        await renderOptimizedSearchResults(query, searchType, tagInput, tagLogic);
        
    } catch (error) {
        console.error('Search error:', error);
        // Show error message
        const searchTitle = document.getElementById('search-title');
        if (searchTitle) {
            searchTitle.textContent = 'Search Error';
        }
    }
}

// Optimized search results rendering
async function renderOptimizedSearchResults(query, searchType, tagInput, tagLogic) {
    const searchTitle = document.getElementById('search-title');
    const searchInfo = document.getElementById('search-info');
    const topicsSection = document.getElementById('topics-results-section');
    const objectsSection = document.getElementById('objects-results-section');
    const noResults = document.getElementById('no-search-results');
    
    // Update title and info
    searchTitle.textContent = 'Search Results';
    
    let infoText = '';
    if (query && tagInput) {
        infoText = `Searching for "${query}" with tags: ${tagInput} (${tagLogic.toUpperCase()})`;
    } else if (query) {
        infoText = `Searching for "${query}"`;
    } else if (tagInput) {
        infoText = `Filtered by tags: ${tagInput} (${tagLogic.toUpperCase()})`;
    }
    
    if (searchType !== 'all') {
        infoText += ` in ${searchType}`;
    }
    
    searchInfo.textContent = infoText;
    
    // Hide all sections initially
    topicsSection.style.display = 'none';
    objectsSection.style.display = 'none';
    noResults.style.display = 'none';
    
    let hasResults = false;
    
    // Render topics results
    if (currentSearchResults.topics?.items?.length > 0) {
        hasResults = true;
        topicsSection.style.display = 'block';
        await renderSearchTopicsOptimized();
    }
    
    // Render objects results
    if (currentSearchResults.objects?.items?.length > 0) {
        hasResults = true;
        objectsSection.style.display = 'block';
        await renderSearchObjectsOptimized();
    }
    
    // Show no results message if needed
    if (!hasResults) {
        noResults.style.display = 'block';
    }
}

// Optimized topic search rendering
async function renderSearchTopicsOptimized() {
    const grid = document.getElementById('search-topics-grid');
    
    try {
        const topics = currentSearchResults.topics.items || [];
        const pagination = currentSearchResults.topics.pagination;
        
        // Render search topics with editors display
        const topicCards = await Promise.all(topics.map(async (topic) => {
            const editorsDisplay = await renderEditorsDisplay('topic', topic.id, topic.creator_username || '', topic.creator_id);
            return `
                <div class="topic-card" onclick="showTopicPage('${topic.id}')">
                    <div class="card-owner">${editorsDisplay}</div>
                    <h3>${escapeHtml(topic.name)}</h3>
                    <p class="rating-text">${topic.object_count} item${topic.object_count !== 1 ? 's' : ''}</p>
                </div>
            `;
        }));
        
        let html = topicCards.join('');
        
        // Add pagination controls
        if (pagination && pagination.totalPages > 1) {
            html += renderPaginationControls('topics', pagination);
        }
        
        grid.innerHTML = html;
    } catch (error) {
        console.error('Error rendering search topics:', error);
        grid.innerHTML = '<div class="error">Failed to load topic results</div>';
    }
}

// Optimized object search rendering
async function renderSearchObjectsOptimized() {
    const grid = document.getElementById('search-objects-grid');
    
    try {
        const objects = currentSearchResults.objects.items || [];
        const pagination = currentSearchResults.objects.pagination;
        
        // Render search objects with ratings and tags
        const objectCards = await Promise.all(objects.map(async (object) => {
            const editorsDisplay = await renderEditorsDisplay('object', object.id, object.creator_username || '', object.creator_id);
            
            // Fetch tags for each object (with caching)
            let tags = [];
            try {
                tags = await fetchObjectTags(object.id);
            } catch (error) {
                console.error(`Error fetching tags for object ${object.id}:`, error);
            }
            
            return `
                <div class="object-card" onclick="showObjectFromSearch('${object.topic_id || object.topicId}', '${object.id}')">
                    <div class="card-owner">${editorsDisplay}</div>
                    <div class="topic-context">From: ${escapeHtml(object.topic_name || 'Unknown Topic')}</div>
                    <h3>${escapeHtml(object.name)}</h3>
                    ${object.avg_rating > 0 ? `
                        <div class="rating">
                            <span class="stars">${renderStars(object.avg_rating)}</span>
                            <span class="rating-text">${object.avg_rating.toFixed(1)} (${object.rating_count} review${object.rating_count !== 1 ? 's' : ''})</span>
                        </div>
                    ` : `
                        <div class="rating">
                            <span class="rating-text">No ratings yet</span>
                        </div>
                    `}
                    ${tags.length > 0 ? `
                        <div class="tags">
                            ${tags.map(tag => `<span class="tag clickable" onclick="searchByTag('${escapeHtml(tag.name)}', event)">${escapeHtml(tag.name)}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }));
        
        let html = objectCards.join('');
        
        // Add pagination controls
        if (pagination && pagination.totalPages > 1) {
            html += renderPaginationControls('objects', pagination);
        }
        
        grid.innerHTML = html;
    } catch (error) {
        console.error('Error rendering search objects:', error);
        grid.innerHTML = '<div class="error">Failed to load object results</div>';
    }
}

// Pagination controls
function renderPaginationControls(type, pagination) {
    const { currentPage, totalPages, hasNext, hasPrev } = pagination;
    
    let controls = '<div class="pagination-controls">';
    
    if (hasPrev) {
        controls += `<button class="pagination-btn" onclick="loadSearchPage(${currentPage - 1})">Previous</button>`;
    }
    
    // Show page numbers (max 5 visible)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    if (startPage > 1) {
        controls += `<button class="pagination-btn" onclick="loadSearchPage(1)">1</button>`;
        if (startPage > 2) {
            controls += '<span class="pagination-ellipsis">...</span>';
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        controls += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="loadSearchPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            controls += '<span class="pagination-ellipsis">...</span>';
        }
        controls += `<button class="pagination-btn" onclick="loadSearchPage(${totalPages})">${totalPages}</button>`;
    }
    
    if (hasNext) {
        controls += `<button class="pagination-btn" onclick="loadSearchPage(${currentPage + 1})">Next</button>`;
    }
    
    controls += '</div>';
    return controls;
}

// Load specific search page
function loadSearchPage(page) {
    performOptimizedSearch(page);
}

// Enhanced fetch functions with pagination support
async function fetchTopics(page = 1, limit = 20, search = '', sortBy = 'created_at', sortOrder = 'DESC') {
    const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder
    });
    
    if (search) {
        params.append('search', search);
    }
    
    const response = await cachedFetch(`${API_BASE}/topics?${params}`);
    
    // Handle both old and new API response formats
    if (response.topics) {
        // New paginated format
        return response.topics;
    } else if (Array.isArray(response)) {
        // Old format - return as is for backward compatibility
        return response;
    } else {
        // Fallback
        return [];
    }
}

async function fetchObjects(topicId, page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'DESC') {
    const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder
    });
    
    const response = await cachedFetch(`${API_BASE}/topics/${topicId}/objects?${params}`);
    
    // Handle both old and new API response formats
    if (response.objects) {
        // New paginated format
        return response.objects;
    } else if (Array.isArray(response)) {
        // Old format - return as is for backward compatibility
        return response;
    } else {
        // Fallback
        return [];
    }
}

// Enhanced search input handler with debouncing
function handleSearchKeypress(event) {
    if (event.key === 'Enter') {
        clearTimeout(searchTimeout);
        performOptimizedSearch();
    } else {
        debounceSearch();
    }
}

// Clear cache when needed
function clearApiCache() {
    apiCache.clear();
}

// Update existing functions to use optimized versions
async function performSearch() {
    await performOptimizedSearch();
}

async function performAdvancedSearch() {
    await performOptimizedSearch();
    toggleAdvancedSearch(); // Hide the panel after search
}

// Debug function to test authentication
window.debugAuth = function() {
    console.log('=== DEBUG AUTH ===');
    console.log('currentUser:', currentUser);
    console.log('token:', getAuthToken());
    console.log('daily usage:', getCurrentDailyUsage());
    const addTopicBtn = document.getElementById('add-topic-btn');
    console.log('add topic button:', addTopicBtn);
    console.log('add topic button disabled:', addTopicBtn ? addTopicBtn.disabled : 'not found');
    console.log('==================');
};

// ... existing code ...

// Function to handle editing a review
async function editReview(ratingId) { // Changed from reviewIndex to ratingId
    if (!currentUser || !currentObjectId) return;

    try {
        // Fetch the specific rating by its ID to ensure we are editing the correct one
        // This requires an endpoint to fetch a single rating, or we adapt fetchRatings to handle it,
        // or we find it within the list already fetched by renderReviews if that list is reliably current.
        // For simplicity and to ensure we edit the exact rating the user clicked on,
        // we assume renderReviews has already fetched all ratings and we can find it.
        // A more robust solution might be a GET /api/ratings/:ratingId endpoint if needed.

        const allRatings = await fetchRatings(currentObjectId); // This fetches all ratings for the object
        const reviewToEdit = allRatings.find(r => r.id == ratingId);


        if (!reviewToEdit) {
            alert('Could not find the review to edit.');
            return;
        }
        // Check if the current user is the owner of the review
        if (reviewToEdit.user_id !== currentUser.id && !currentUser.isAdmin) {
            alert('You can only edit your own reviews.');
            return;
        }


        // Populate the rating form
        selectedRating = reviewToEdit.rating;
        document.getElementById('review-text').value = reviewToEdit.review || '';
        updateStarDisplay(); // Update the visual star selection

        // Change button text to indicate an update
        document.getElementById('submit-rating-btn').textContent = 'Update Rating';
        // Store the ID of the rating being edited
        document.getElementById('submit-rating-btn').dataset.editingRatingId = reviewToEdit.id;


        // Scroll to the rating form for convenience
        document.getElementById('star-rating').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Error preparing review for editing:', error);
        alert('Failed to load review for editing: ' + error.message);
    }
}
window.editReview = editReview;

// Object editing functions
// ... existing code ...
async function submitRatingToAPI(objectId, rating, review) { // This is for NEW ratings
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/objects/${objectId}/ratings`, { // POST to create new
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ rating, review })
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to submit new rating');
    }
    return await res.json();
}

async function updateRatingAPI(ratingId, rating, review) { // This is for UPDATING existing ratings
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + `/api/ratings/${ratingId}`, { // PUT to update specific rating
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ rating, review })
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update rating');
    }
    return await res.json();
}


// Replace renderReviews to use API
async function renderReviews() {
    const reviewsList = document.getElementById('reviews-list');
    try {
        const ratingsData = await fetchRatings(currentObjectId); // fetchRatings returns the array directly
        if (!ratingsData || ratingsData.length === 0) {
            reviewsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comment"></i>
                    <h3>No reviews yet</h3>
                    <p>Be the first to share your thoughts!</p>
                </div>
            `;
            return;
        }
        // Sort ratings by date (newest first)
        const sortedRatings = [...ratingsData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        reviewsList.innerHTML = sortedRatings.map((rating) => `
            <div class="review-item" id="review-${rating.id}">
                <div class="review-owner">by ${makeUsernameClickable(rating.username, rating.user_id)}</div>
                ${currentUser && rating.user_id === currentUser.id ? `
                    <div class="review-actions">
                        <button class="btn btn-small btn-secondary" onclick="editReview(${rating.id})">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </div>
                ` : ''}
                <div class="review-header">
                    <span class="review-rating">${renderStars(rating.rating)}</span>
                    <span class="review-date">${formatDate(rating.created_at)}</span>
                </div>
                ${rating.review ? `<div class="review-text">${escapeHtml(rating.review)}</div>` : ''}
                ${rating.updated_at && rating.updated_at !== rating.created_at ? `<div class="review-edited-notice">(edited ${formatDate(rating.updated_at)})</div>` : ''}
            </div>
        `).join('');
    } catch (e) {
        reviewsList.innerHTML = '<div class="error">Failed to load reviews.</div>';
    }
}

// Replace submitRating to use API
async function submitRating() {
    if (!currentUser) {
        alert('Please login to submit ratings');
        return;
    }
    if (selectedRating === 0) {
        alert('Please select a rating');
        return;
    }
    
    const reviewText = document.getElementById('review-text').value.trim();
    const submitButton = document.getElementById('submit-rating-btn');
    const editingRatingId = submitButton.dataset.editingRatingId;

    try {
        let result;
        if (editingRatingId) {
            // This is an update to an existing rating
            result = await updateRatingAPI(editingRatingId, selectedRating, reviewText);
            showNotification('Rating updated successfully!');
        } else {
            // This is a new rating submission
            // Check daily limits before proceeding (admins bypass this)
            if (!currentUser.isAdmin && !incrementDailyUsage('ratings')) {
                 // incrementDailyUsage already shows an alert if limit is reached
                return; 
            }
            result = await submitRatingToAPI(currentObjectId, selectedRating, reviewText);
            showNotification('New rating submitted successfully!');
        }
        
        // Clear API cache to ensure fresh data
        clearApiCache();
        
        await renderObjectDetails(); // Recalculates average, etc.
        await renderReviews();     // Re-renders the reviews list
        
        // Reset the form
        resetRatingForm(); // This will also clear editingRatingId from the button and reset its text

    } catch (e) {
        // Check if it's a content filter error
        if (e.message.includes('sensitive content') || e.message.includes('inappropriate content')) {
            alert('Content Filter Error: ' + e.message + '\n\nPlease revise your review text to remove any inappropriate content.');
        } else {
             alert('Failed to submit rating: ' + e.message);
        }
        // If it was a new rating attempt that failed due to non-limit reasons, and usage was incremented,
        // we might need to decrement it. However, incrementDailyUsage only returns false if limit reached.
        // Failures due to 24h cooldown or other errors won't have incremented the daily usage counter yet.
    }
}


// Star rating system
// ... existing code ...
function resetRatingForm() {
    selectedRating = 0;
    updateStarDisplay();
    document.getElementById('review-text').value = '';
    const submitButton = document.getElementById('submit-rating-btn');
    submitButton.textContent = 'Submit Rating';
    delete submitButton.dataset.editingRatingId; // Clear editing state
    // editingReview = null; // This global variable seems unused for this flow now
}

// Utility functions
// ... existing code ...
async function loadMyRating() {
    if (!currentUser || !currentObjectId) {
        resetRatingForm(); // Ensure form is reset if no user/object
        return;
    }
    
    try {
        const result = await fetchMyObjectRating(currentObjectId); // Fetches the LATEST rating by this user
        if (result.rating) {
            // Pre-populate the form with the user's LATEST rating
            // This is for display when page loads. If they want to edit an OLDER rating, they use the edit button next to it.
            selectedRating = result.rating.rating;
            document.getElementById('review-text').value = result.rating.review || '';
            document.getElementById('submit-rating-btn').textContent = 'Submit New Rating (or Edit Latest)'; // Clarify button action
            // Do NOT set editingRatingId here, as this is just loading their latest for potential new submission
            // If they want to edit this specific latest one, they should ideally click an edit button for it if one were shown.
            // Or, we can decide that `loadMyRating` prepares for an *update* of this latest rating.
            // For now, let's keep it simple: it loads data. If user submits, it's a NEW rating unless an `editReview` call set an `editingRatingId`.
            updateStarDisplay();
        } else {
            // No existing rating by this user for this object
            resetRatingForm();
        }
    } catch (error) {
        console.error('Error loading my rating:', error);
        resetRatingForm();
    }
}