// Rank-Anything Web Application v2.0 with User Authentication
// Set your backend API URL here:
const BACKEND_URL = 'https://rank-anything.onrender.com';
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
            alert(result.error || 'Login failed');
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
            loginUser(result.user, result.token);
            closeAuthModal();
            showNotification('Registration successful! Welcome ' + username + '!');
            console.log('Registration completed successfully');
        } else {
            alert(result.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error details:', error);
        console.error('Error stack:', error.stack);
        alert('Registration failed with error: ' + error.message + '. Check console for details.');
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
    if (token && token.split('.').length === 3) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = payload;
            resetDailyUsageIfNeeded();
            updateUserInterface();
        } catch (e) {
            clearAuthToken();
            currentUser = null;
        }
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
        
        // Enable/disable buttons based on daily limits
        const usage = getCurrentDailyUsage();
        if (addTopicBtn) addTopicBtn.disabled = usage.topics >= 4;
        if (addObjectBtn) addObjectBtn.disabled = usage.objects >= 32;
        if (submitRatingBtn) submitRatingBtn.disabled = usage.ratings >= 64;
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
        userInfo.style.display = 'none';
        authButtons.style.display = 'flex';
        
        // Disable all creation buttons for non-logged users
        if (addTopicBtn) addTopicBtn.disabled = true;
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
    const userUsage = data.dailyUsage[currentUser.username];
    
    if (!userUsage || userUsage.date !== today) {
        data.dailyUsage[currentUser.username] = {
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
    return data.dailyUsage[currentUser.username] || { topics: 0, objects: 0, ratings: 0 };
}

function incrementDailyUsage(type) {
    if (!currentUser) return false;
    
    const usage = getCurrentDailyUsage();
    const limits = { topics: 4, objects: 32, ratings: 64 };
    
    if (usage[type] >= limits[type]) {
        alert(`Daily limit reached! You can only create ${limits[type]} ${type} per day.`);
        return false;
    }
    
    usage[type]++;
    data.dailyUsage[currentUser.username] = usage;
    saveData();
    updateDailyLimitsDisplay();
    updateUserInterface();
    return true;
}

function updateDailyLimitsDisplay() {
    if (!currentUser) return;
    
    const usage = getCurrentDailyUsage();
    const display = document.getElementById('daily-limits-display');
    
    display.textContent = `Today: ${usage.topics}/4 topics, ${usage.objects}/32 objects, ${usage.ratings}/64 ratings`;
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
        
        document.getElementById('object-title').textContent = object.name;
        
        // Show edit/delete buttons if user owns the object
        updateObjectActions(object);
        
        updateBreadcrumb();
        await renderObjectDetails();
        await renderReviews();
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
                
                const newTags = newTagsStr ? newTagsStr.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
                
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
                const newTags = newTagsStr ? newTagsStr.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
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
        tagFilters = tagInput.split(',').map(tag => tag.trim()).filter(tag => tag);
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
        
        grid.innerHTML = topicsWithCounts.map(topic => {
            return `
                <div class="topic-card" onclick="showTopicPage('${topic.id}')">
                    <div class="card-owner">by ${escapeHtml(topic.creator_username || '')}</div>
                    <h3>${escapeHtml(topic.name)}</h3>
                    <p class="rating-text">${topic.objectCount} item${topic.objectCount !== 1 ? 's' : ''}</p>
                </div>
            `;
        }).join('');
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
        
        grid.innerHTML = objectsWithDetails.map(object => {
            return `
                <div class="object-card" onclick="showObjectFromSearch('${object.topicId}', '${object.id}')">
                    <div class="card-owner">by ${escapeHtml(object.creator_username || '')}</div>
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
        }).join('');
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
    return await res.json();
}

async function createTopic(name, tags) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + '/api/topics', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name, tags })
    });
    if (!res.ok) throw new Error('Failed to create topic');
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
        grid.innerHTML = topics.map(topic => {
            return `
                <div class="topic-card" onclick="showTopicPage('${topic.id}')">
                    <div class="card-owner">by ${escapeHtml(topic.creator_username || '')}</div>
                    <h3>${escapeHtml(topic.name)}</h3>
                    <p class="rating-text">Created: ${formatDate(topic.created_at)}</p>
                </div>
            `;
        }).join('');
    } catch (e) {
        grid.innerHTML = '<div class="error">Failed to load topics.</div>';
    }
}

// Replace addTopic to use API
async function addTopic(event) {
    event.preventDefault();
    if (!currentUser) {
        alert('Please login to add topics');
        return;
    }
    
    // Check daily limits before proceeding
    if (!incrementDailyUsage('topics')) {
        return;
    }
    
    const topicName = document.getElementById('topic-name').value.trim();
    const topicTagsStr = document.getElementById('topic-tags').value.trim();
    if (!topicName) return;
    
    const tags = topicTagsStr ? topicTagsStr.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
    
    try {
        await createTopic(topicName, tags);
        renderTopics();
        hideAddTopicForm();
        showNotification('Topic created!');
    } catch (e) {
        alert('Failed to create topic: ' + e.message);
        // Revert daily usage increment on failure
        const usage = getCurrentDailyUsage();
        usage.topics = Math.max(0, usage.topics - 1);
        data.dailyUsage[currentUser.username] = usage;
        saveData();
        updateDailyLimitsDisplay();
        updateUserInterface();
    }
}

// --- Object Management with Backend API ---
async function fetchObjects(topicId) {
    const res = await fetch(BACKEND_URL + `/api/topics/${topicId}/objects`);
    if (!res.ok) throw new Error('Failed to fetch objects');
    return await res.json();
}

async function fetchObject(objectId) {
    // Since we don't have a direct object endpoint, we'll fetch from the current topic
    const objects = await fetchObjects(currentTopicId);
    return objects.find(obj => obj.id == objectId);
}

async function fetchTopic(topicId) {
    const topics = await fetchTopics();
    return topics.find(topic => topic.id == topicId);
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
        
        grid.innerHTML = objectsWithTags.map(object => {
            return `
                <div class="object-card" onclick="showObjectPage('${object.id}')">
                    <div class="card-owner">by ${escapeHtml(object.creator_username || '')}</div>
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
        }).join('');
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
    
    // Check daily limits before proceeding
    if (!incrementDailyUsage('objects')) {
        return;
    }
    
    const objectName = document.getElementById('object-name').value.trim();
    const objectTagsStr = document.getElementById('object-tags').value.trim();
    if (!objectName) return;
    
    try {
        const newObject = await createObject(currentTopicId, objectName);
        
        // Add additional tags if specified (beyond inherited topic tags)
        if (objectTagsStr) {
            const additionalTags = objectTagsStr.split(',').map(tag => tag.trim()).filter(tag => tag);
            if (additionalTags.length > 0) {
                // Get current tags (inherited from topic)
                const currentTags = await fetchObjectTags(newObject.id);
                const currentTagNames = currentTags.map(tag => tag.name);
                
                // Combine current tags with additional tags (remove duplicates)
                const allTags = [...new Set([...currentTagNames, ...additionalTags])];
                await assignTagsToObject(newObject.id, allTags);
            }
        }
        
        renderObjects();
        hideAddObjectForm();
        showNotification('Object created!');
    } catch (e) {
        alert('Failed to create object: ' + e.message);
        // Revert daily usage increment on failure
        const usage = getCurrentDailyUsage();
        usage.objects = Math.max(0, usage.objects - 1);
        data.dailyUsage[currentUser.username] = usage;
        saveData();
        updateDailyLimitsDisplay();
        updateUserInterface();
    }
}

// Object details and rating
async function renderObjectDetails() {
    try {
        const object = await fetchObject(currentObjectId);
        const ratings = await fetchRatings(currentObjectId);
        const averageRating = calculateAverageRating(ratings);
        const ratingCount = ratings.length;
        
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
    return await res.json();
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
    if (!res.ok) throw new Error('Failed to submit rating');
    return await res.json();
}

// Replace renderReviews to use API
async function renderReviews() {
    const reviewsList = document.getElementById('reviews-list');
    try {
        const ratings = await fetchRatings(currentObjectId);
        if (ratings.length === 0) {
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
        const sortedRatings = [...ratings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        reviewsList.innerHTML = sortedRatings.map((rating, index) => `
            <div class="review-item">
                <div class="review-owner">by ${escapeHtml(rating.username)}</div>
                ${currentUser && rating.user_id === currentUser.id ? `
                    <div class="review-actions">
                        <button class="btn btn-small btn-secondary" onclick="editReview(${index})">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                ` : ''}
                <div class="review-header">
                    <span class="review-rating">${renderStars(rating.rating)}</span>
                    <span class="review-date">${formatDate(rating.created_at)}</span>
                </div>
                ${rating.review ? `<div class="review-text">${escapeHtml(rating.review)}</div>` : ''}
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
    
    // Check daily limits before proceeding
    if (!incrementDailyUsage('ratings')) {
        return;
    }
    
    const reviewText = document.getElementById('review-text').value.trim();
    try {
        await submitRatingToAPI(currentObjectId, selectedRating, reviewText);
        await renderObjectDetails();
        await renderReviews();
        resetRatingForm();
        showNotification('Rating submitted successfully!');
    } catch (e) {
        alert('Failed to submit rating: ' + e.message);
        // Revert daily usage increment on failure
        const usage = getCurrentDailyUsage();
        usage.ratings = Math.max(0, usage.ratings - 1);
        data.dailyUsage[currentUser.username] = usage;
        saveData();
        updateDailyLimitsDisplay();
        updateUserInterface();
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
    document.getElementById('submit-rating-btn').textContent = 'Submit Rating';
    editingReview = null;
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
            <div class="user-space-main">
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
                            <input type="email" id="user-space-email" value="${escapeHtml(currentUser.email)}" required>
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

async function updateUserInfo(event) {
    event.preventDefault();
    const newUsername = document.getElementById('user-space-username').value.trim();
    const newEmail = document.getElementById('user-space-email').value.trim();
    
    if (!newUsername || !newEmail) {
        alert('Username and email cannot be empty');
        return;
    }
    
    if (newUsername === currentUser.username && newEmail === currentUser.email) {
        showNotification('No changes to save');
        return;
    }
    
    try {
        const result = await updateUserProfile(currentUser.id, newUsername, newEmail);
        
        // Update current user and token
        currentUser = result.user;
        saveAuthToken(result.token);
        
        updateUserInterface();
        showNotification('Profile updated successfully!');
        
        // Refresh the user space page to show updated stats
        await renderUserSpacePage();
        
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
        console.error('Chart canvas element not found');
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
    let html = `<div class='modal-content admin-panel-modal-content'><div class='modal-header'><h2>Admin Panel</h2><button class='modal-close' onclick='closeAdminPanel()'><i class='fas fa-times'></i></button></div><div class='modal-body'><h3>All Users</h3><div id='admin-users-list'>Loading...</div></div></div>`;
    modal.innerHTML = html;
    await renderAdminUsersList();
}

async function renderAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    try {
        const token = getAuthToken();
        const response = await fetch(BACKEND_URL + '/api/admin/users', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        
        const users = await response.json();
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
                            <span class="created-by">Created by: ${escapeHtml(object.creator_username || 'Unknown')}</span>
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
        
        const newTags = newTagsStr ? newTagsStr.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        
        if (newName.trim() === object.name && JSON.stringify(newTags.sort()) === JSON.stringify(currentTagNames.sort())) {
            return; // No changes
        }
        
        await updateObject(currentObjectId, newName.trim());
        if (newTags.length > 0 || currentTagNames.length > 0) {
            await assignTagsToObject(currentObjectId, newTags);
        }
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
        
        const newTags = newTagsStr ? newTagsStr.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        
        await updateTopic(currentTopicId, newName.trim(), newTags);
        
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
window.showObjectStatsPage = showObjectStatsPage;
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