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

function showSearchPage(query, searchType = 'all', tagFilters = null, tagLogic = 'and') {
    currentPage = 'search';
    lastSearchQuery = query;
    
    hideAllPages();
    document.getElementById('search-page').classList.add('active');
    
    updateBreadcrumb();
    performSearchOperation(query, searchType, tagFilters, tagLogic);
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
                if (!newName || newName.trim() === '' || newName.trim() === topic.name) return;
                try {
                    await createProposal('edit', 'topic', topic.id, newName.trim(), 'User proposed topic name change');
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

function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;
    
    showSearchPage(query);
}

function toggleAdvancedSearch() {
    const panel = document.getElementById('advanced-search-panel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
}

function performAdvancedSearch() {
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
    
    showSearchPage(query, searchType, tagFilters, tagLogic);
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

function performSearchOperation(query, searchType, tagFilters, tagLogic) {
    const results = {
        topics: [],
        objects: []
    };
    
    // Search topics
    if (searchType === 'all' || searchType === 'topics') {
        results.topics = searchTopics(query, tagFilters, tagLogic);
    }
    
    // Search objects
    if (searchType === 'all' || searchType === 'objects') {
        results.objects = searchObjects(query, tagFilters, tagLogic);
    }
    
    currentSearchResults = results;
    renderSearchResults(query, searchType, tagFilters, tagLogic);
}

function searchTopics(query, tagFilters, tagLogic) {
    return data.topics.filter(topic => {
        if (query && !topic.name.toLowerCase().includes(query.toLowerCase())) {
            return false;
        }
        
        // For topics, we don't have direct tags, but we can search objects within topics
        if (tagFilters && tagFilters.length > 0) {
            const topicObjects = data.objects[topic.id] || [];
            const hasMatchingObjects = topicObjects.some(object => 
                matchesTags(object.tags, tagFilters, tagLogic)
            );
            return hasMatchingObjects;
        }
        
        return true;
    });
}

function searchObjects(query, tagFilters, tagLogic) {
    const results = [];
    
    Object.keys(data.objects).forEach(topicId => {
        const topicObjects = data.objects[topicId] || [];
        const topic = data.topics.find(t => t.id === topicId);
        
        topicObjects.forEach(object => {
            let matches = true;
            
            // Text search
            if (query) {
                const searchText = query.toLowerCase();
                const objectMatches = object.name.toLowerCase().includes(searchText) ||
                                   object.tags.some(tag => tag.toLowerCase().includes(searchText));
                
                if (!objectMatches) {
                    matches = false;
                }
            }
            
            // Tag filters
            if (matches && tagFilters && tagFilters.length > 0) {
                matches = matchesTags(object.tags, tagFilters, tagLogic);
            }
            
            if (matches) {
                results.push({
                    ...object,
                    topicId: topicId,
                    topicName: topic.name
                });
            }
        });
    });
    
    return results;
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

function renderSearchResults(query, searchType, tagFilters, tagLogic) {
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
        renderSearchTopics();
    }
    
    // Render objects results
    if (currentSearchResults.objects.length > 0) {
        hasResults = true;
        objectsSection.style.display = 'block';
        renderSearchObjects();
    }
    
    // Show no results message if needed
    if (!hasResults) {
        noResults.style.display = 'block';
    }
}

function renderSearchTopics() {
    const grid = document.getElementById('search-topics-grid');
    
    grid.innerHTML = currentSearchResults.topics.map(topic => {
        const objectCount = data.objects[topic.id] ? data.objects[topic.id].length : 0;
        return `
            <div class="topic-card" onclick="showTopicPage('${topic.id}')">
                <div class="card-owner">by ${escapeHtml(topic.createdBy)}</div>
                <h3>${escapeHtml(topic.name)}</h3>
                <p class="rating-text">${objectCount} item${objectCount !== 1 ? 's' : ''}</p>
            </div>
        `;
    }).join('');
}

function renderSearchObjects() {
    const grid = document.getElementById('search-objects-grid');
    
    grid.innerHTML = currentSearchResults.objects.map(object => {
        const ratings = data.ratings[object.topicId][object.id] || [];
        const averageRating = calculateAverageRating(ratings);
        const ratingCount = ratings.length;
        
        return `
            <div class="object-card" onclick="showObjectFromSearch('${object.topicId}', '${object.id}')">
                <div class="card-owner">by ${escapeHtml(object.createdBy)}</div>
                <div class="topic-context">From: ${escapeHtml(object.topicName)}</div>
                <h3>${escapeHtml(object.name)}</h3>
                ${averageRating > 0 ? `
                    <div class="rating">
                        <span class="stars">${renderStars(averageRating)}</span>
                        <span class="rating-text">${averageRating.toFixed(1)} (${ratingCount} review${ratingCount !== 1 ? 's' : ''})</span>
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
}

async function showObjectFromSearch(topicId, objectId) {
    currentTopicId = topicId;
    await showObjectPage(objectId);
}

function searchByTag(tag, event) {
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
    showSearchPage('', 'all', [tag], 'or');
}

// --- Topic Management with Backend API ---
async function fetchTopics() {
    const res = await fetch(BACKEND_URL + '/api/topics');
    if (!res.ok) throw new Error('Failed to fetch topics');
    return await res.json();
}

async function createTopic(name) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + '/api/topics', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error('Failed to create topic');
    return await res.json();
}

async function updateTopic(id, name) {
    const token = getAuthToken();
    const res = await fetch(BACKEND_URL + '/api/topics/' + id, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ name })
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
    const topicName = document.getElementById('topic-name').value.trim();
    if (!topicName) return;
    try {
        await createTopic(topicName);
        renderTopics();
        hideAddTopicForm();
        showNotification('Topic created!');
    } catch (e) {
        alert('Failed to create topic: ' + e.message);
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
        grid.innerHTML = objects.map(object => {
            return `
                <div class="object-card" onclick="showObjectPage('${object.id}')">
                    <div class="card-owner">by ${escapeHtml(object.creator_username || '')}</div>
                    <h3>${escapeHtml(object.name)}</h3>
                    <div class="rating">
                        <span class="rating-text">Created: ${formatDate(object.created_at)}</span>
                    </div>
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
    const objectName = document.getElementById('object-name').value.trim();
    if (!objectName) return;
    try {
        await createObject(currentTopicId, objectName);
        renderObjects();
        hideAddObjectForm();
        showNotification('Object created!');
    } catch (e) {
        alert('Failed to create object: ' + e.message);
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
    const reviewText = document.getElementById('review-text').value.trim();
    try {
        await submitRatingToAPI(currentObjectId, selectedRating, reviewText);
        await renderObjectDetails();
        await renderReviews();
        resetRatingForm();
        showNotification('Rating submitted successfully!');
    } catch (e) {
        alert('Failed to submit rating: ' + e.message);
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

// Sample data for demonstration (optional)
function loadSampleData() {
    if (Object.keys(data.users).length === 0) {
        const sampleData = {
            users: {
                'john': {
                    username: 'john',
                    email: 'john@example.com',
                    password: 'password123',
                    joinedAt: new Date().toISOString()
                },
                'alice': {
                    username: 'alice',
                    email: 'alice@example.com',
                    password: 'password123',
                    joinedAt: new Date().toISOString()
                }
            },
            topics: [
                {
                    id: 'topic1',
                    name: 'Peking University Cafeteria Dishes',
                    createdAt: new Date().toISOString(),
                    createdBy: 'john',
                    type: 'topic'
                },
                {
                    id: 'topic2',
                    name: 'Favorite Movies',
                    createdAt: new Date().toISOString(),
                    createdBy: 'alice',
                    type: 'topic'
                }
            ],
            objects: {
                'topic1': [
                    {
                        id: 'obj1',
                        name: 'Shaoyuan Cafeteria Yellow Braised Chicken',
                        tags: ['Peking University', 'Cafeteria', 'Shaoyuan', 'Yellow Braised Chicken', 'Mildly Spicy', 'Chicken'],
                        createdAt: new Date().toISOString(),
                        createdBy: 'john',
                        type: 'object'
                    },
                    {
                        id: 'obj2',
                        name: 'Student Canteen Beef Noodles',
                        tags: ['Peking University', 'Cafeteria', 'Student Canteen', 'Beef', 'Noodles', 'Spicy'],
                        createdAt: new Date().toISOString(),
                        createdBy: 'alice',
                        type: 'object'
                    }
                ],
                'topic2': [
                    {
                        id: 'obj3',
                        name: 'The Matrix',
                        tags: ['Sci-Fi', 'Action', '1999', 'Keanu Reeves'],
                        createdAt: new Date().toISOString(),
                        createdBy: 'alice',
                        type: 'object'
                    }
                ]
            },
            ratings: {
                'topic1': {
                    'obj1': [
                        {
                            rating: 4,
                            review: 'Really tasty and well-seasoned! The chicken is tender and the sauce is flavorful.',
                            createdAt: new Date().toISOString(),
                            createdBy: 'john'
                        }
                    ],
                    'obj2': [
                        {
                            rating: 5,
                            review: 'Amazing beef noodles! Perfect spice level.',
                            createdAt: new Date().toISOString(),
                            createdBy: 'alice'
                        }
                    ]
                },
                'topic2': {
                    'obj3': [
                        {
                            rating: 5,
                            review: 'A masterpiece of science fiction cinema!',
                            createdAt: new Date().toISOString(),
                            createdBy: 'alice'
                        }
                    ]
                }
            },
            proposals: {},
            dailyUsage: {}
        };
        
        data = sampleData;
        saveData();
    }
}

// Uncomment the line below to load sample data on first visit
// loadSampleData(); 

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
                activityText = `Created ${activity.proposal_type} proposal for ${activity.target_type}`;
                if (activity.reason) {
                    extraInfo = ` - Reason: "${escapeHtml(activity.reason)}"`;
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
    
    const ctx = document.getElementById('user-daily-chart').getContext('2d');
    
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
    // UI for granularity and reset
    let html = `<h2>Statistics for: ${escapeHtml(object.name)}</h2>`;
    html += `<div style='margin-bottom:1rem;'>
        <label for='stats-granularity'><strong>Time Granularity:</strong></label>
        <select id='stats-granularity'>
            <option value='day'>Day</option>
            <option value='week'>Week</option>
            <option value='month'>Month</option>
            <option value='year'>Year</option>
            <option value='hour'>Hour</option>
            <option value='minute'>Minute</option>
        </select>
        <button class='btn btn-small' onclick='objectStatsSelectedRange=null;renderObjectStatsPage()' style='margin-left:1rem;'>Reset Selection</button>
    </div>`;
    html += `<div style='display:flex;flex-wrap:wrap;gap:2rem;'>
        <div style='flex:1;min-width:320px;'>
            <canvas id='ratings-bar-chart'></canvas>
        </div>
        <div style='flex:2;min-width:480px;overflow-x:auto;'>
            <canvas id='ratings-line-chart' style='min-width:600px;'></canvas>
        </div>
    </div>`;
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
    const ctx = document.getElementById('ratings-line-chart').getContext('2d');
    if (window.objectStatsLineChart) window.objectStatsLineChart.destroy();
    window.objectStatsLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [{
                label: 'Average Rating',
                data: avgScores,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.1)',
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { drag: { enabled: true }, mode: 'x' },
                    limits: { x: { min: 0, max: timeLabels.length-1 } },
                    onZoomComplete: ({chart}) => {
                        // Get visible range indices
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
                        // Same as zoom
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
                y: { min: 1, max: 5, ticks: { stepSize: 1 } },
                x: { ticks: { autoSkip: false } }
            }
        }
    });
    // --- Bar chart: rating counts (filtered by selection if any) ---
    let filteredRatings = ratings;
    if (objectStatsSelectedRange && objectStatsSelectedRange.length === 2) {
        const [minT, maxT] = objectStatsSelectedRange;
        filteredRatings = ratings.filter(r => {
            const t = new Date(r.created_at).getTime();
            return t >= minT && t <= maxT;
        });
    }
    const ratingCounts = [0,0,0,0,0];
    filteredRatings.forEach(r => {
        if (r.rating >= 1 && r.rating <= 5) ratingCounts[r.rating-1]++;
    });
    new Chart(document.getElementById('ratings-bar-chart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'],
            datasets: [{
                label: 'Number of Ratings',
                data: ratingCounts,
                backgroundColor: ['#f87171','#fbbf24','#facc15','#34d399','#60a5fa'],
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, precision:0 } }
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
        proposalsList.innerHTML = proposals.map(p => {
            const isAdmin = currentUser && currentUser.isAdmin;
            const formatNewValue = () => {
                if (!p.new_value) return 'N/A';
                try {
                    const parsed = JSON.parse(p.new_value);
                    if (parsed.name && parsed.tags) {
                        return `Name: "${parsed.name}", Tags: [${parsed.tags.join(', ')}]`;
                    }
                    return p.new_value;
                } catch {
                    return p.new_value;
                }
            };
            
            return `
                <div class="proposal-item">
                    <div class="proposal-header">
                        <span class="proposal-type">${escapeHtml(p.type.toUpperCase())} ${escapeHtml(p.target_type.toUpperCase())}</span>
                        <div class="proposal-user">Proposed by: ${escapeHtml(p.proposer_username || 'Unknown')}</div>
                    </div>
                    <div class="proposal-content">
                        <div><strong>Target ID:</strong> ${p.target_id}</div>
                        ${p.reason ? `<div><strong>Reason:</strong> ${escapeHtml(p.reason)}</div>` : ''}
                        ${p.new_value ? `<div><strong>Proposed Changes:</strong> ${escapeHtml(formatNewValue())}</div>` : ''}
                        <div><strong>Created:</strong> ${formatDate(p.created_at)}</div>
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
            `;
        }).join('');
    } catch (e) {
        proposalsList.innerHTML = '<div class="error">Failed to load proposals.</div>';
    }
}

window.voteProposalUI = async function(proposalId, vote) {
    try {
        await voteProposal(proposalId, vote);
        showNotification('Vote submitted!');
        document.renderProposals();
    } catch (e) {
        alert('Failed to vote: ' + e.message);
    }
}

window.executeProposalUI = async function(proposalId) {
    try {
        await executeProposal(proposalId);
        showNotification('Proposal executed!');
        document.renderProposals();
    } catch (e) {
        alert('Failed to execute proposal: ' + e.message);
    }
}

// Ensure UI functions are globally available for HTML onclick
window.showAddTopicForm = showAddTopicForm;
window.hideAddTopicForm = hideAddTopicForm;
window.addTopic = addTopic;
window.showAddObjectForm = showAddObjectForm;
window.hideAddObjectForm = hideAddObjectForm;
window.addObject = addObject;
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