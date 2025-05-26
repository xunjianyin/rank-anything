// Rank-Anything Web Application v2.0 with User Authentication
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
function performLogin() {
    console.log('Perform login called');
    
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }
    
    const user = data.users[username];
    if (!user || user.password !== password) {
        alert('Invalid username or password');
        return;
    }
    
    loginUser(user);
    closeAuthModal();
    showNotification('Welcome back, ' + username + '!');
}

function performRegister() {
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
        // Prevent duplicate username
        if (data.users[username]) {
            alert('Username already exists');
            return;
        }
        // Prevent duplicate email
        for (const userKey in data.users) {
            if (data.users[userKey].email === email) {
                alert('Email already registered');
                return;
            }
        }
        console.log('Step 5: Creating user object');
        const user = {
            username: username,
            email: email,
            password: password,
            joinedAt: new Date().toISOString()
        };
        console.log('Created user object:', user);
        console.log('Step 6: Adding user to data');
        data.users[username] = user;
        console.log('Step 7: Saving data');
        saveData();
        console.log('Step 8: Logging in user');
        loginUser(user);
        console.log('Step 9: Closing modal');
        closeAuthModal();
        console.log('Step 10: Showing notification');
        showNotification('Registration successful! Welcome ' + username + '!');
        console.log('Registration completed successfully');
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

function loginUser(user) {
    console.log('Logging in user:', user.username);
    currentUser = user;
    if (user.username === 'Admin') currentUser.isAdmin = true;
    localStorage.setItem('currentUser', user.username);
    updateUserInterface();
    resetDailyUsageIfNeeded();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    updateUserInterface();
    showHomePage();
}

function checkUserSession() {
    const savedUsername = localStorage.getItem('currentUser');
    if (savedUsername && data.users[savedUsername]) {
        currentUser = data.users[savedUsername];
        updateUserInterface();
        resetDailyUsageIfNeeded();
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
            
            // Merge with default structure to ensure all properties exist
            data = {
                users: {},
                topics: [],
                objects: {},
                ratings: {},
                proposals: {},
                dailyUsage: {},
                ...parsedData
            };
            
            // Ensure users object exists even if it was undefined in saved data
            if (!data.users || typeof data.users !== 'object') {
                data.users = {};
            }
            
            // Ensure proposals object exists
            if (!data.proposals || typeof data.proposals !== 'object') {
                data.proposals = {};
            }
            
            // Ensure dailyUsage object exists
            if (!data.dailyUsage || typeof data.dailyUsage !== 'object') {
                data.dailyUsage = {};
            }
            
            console.log('Data loaded successfully:', data);
        } else {
            console.log('No saved data found, using default structure');
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
    ensureAdminUser();
}

// Ensure admin user exists on load
function ensureAdminUser() {
    if (!data.users['Admin']) {
        data.users['Admin'] = {
            username: 'Admin',
            email: 'admin@system.local',
            password: '202505262142',
            joinedAt: new Date().toISOString(),
            isAdmin: true
        };
    } else {
        data.users['Admin'].isAdmin = true;
    }
}

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

function showTopicPage(topicId) {
    currentPage = 'topic';
    currentTopicId = topicId;
    currentObjectId = null;
    
    hideAllPages();
    document.getElementById('topic-page').classList.add('active');
    
    const topic = data.topics.find(t => t.id === topicId);
    document.getElementById('topic-title').textContent = topic.name;
    
    // Show edit/delete buttons if user owns the topic
    updateTopicActions(topic);
    
    updateBreadcrumb();
    renderObjects();
    clearSearch();
}

function showObjectPage(objectId) {
    currentPage = 'object';
    currentObjectId = objectId;
    
    hideAllPages();
    document.getElementById('object-page').classList.add('active');
    
    const object = data.objects[currentTopicId].find(o => o.id === objectId);
    document.getElementById('object-title').textContent = object.name;
    
    // Show edit/delete buttons if user owns the object
    updateObjectActions(object);
    
    updateBreadcrumb();
    renderObjectDetails();
    renderReviews();
    resetRatingForm();
    clearSearch();
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
    renderProposals();
    toggleUserMenu(); // Close the dropdown
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = '';
    
    if (currentPage === 'home') {
        html = 'Topics';
    } else if (currentPage === 'topic') {
        const topic = data.topics.find(t => t.id === currentTopicId);
        html = `<a href="#" onclick="showHomePage()">Topics</a> > ${topic.name}`;
    } else if (currentPage === 'object') {
        const topic = data.topics.find(t => t.id === currentTopicId);
        const object = data.objects[currentTopicId].find(o => o.id === currentObjectId);
        html = `<a href="#" onclick="showHomePage()">Topics</a> > <a href="#" onclick="showTopicPage('${currentTopicId}')">${topic.name}</a> > ${object.name}`;
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
    if (currentUser && (currentUser.isAdmin || topic.createdBy === currentUser.username)) {
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
            proposeEditBtn.onclick = function() {
                const newName = prompt('Enter new topic name:', topic.name);
                if (!newName || newName.trim() === '' || newName.trim() === topic.name) return;
                createProposal('edit-topic', topic.id, { name: newName.trim() });
                showNotification('Edit proposal submitted for community voting');
            };
            editBtn.parentNode.insertBefore(proposeEditBtn, editBtn.nextSibling);
            proposeDeleteBtn = document.createElement('button');
            proposeDeleteBtn.id = proposeDeleteBtnId;
            proposeDeleteBtn.className = 'btn btn-small btn-danger';
            proposeDeleteBtn.textContent = 'Propose Delete';
            proposeDeleteBtn.onclick = function() {
                if (!confirm('Are you sure you want to propose deletion of this topic?')) return;
                createProposal('delete-topic', topic.id, {});
                showNotification('Deletion proposal submitted for community voting');
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
    if (currentUser && (currentUser.isAdmin || object.createdBy === currentUser.username)) {
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
            proposeEditBtn.onclick = function() {
                const newName = prompt('Enter new object name:', object.name);
                if (!newName || newName.trim() === '') return;
                const newTagsStr = prompt('Enter tags (comma-separated):', object.tags.join(', '));
                if (newTagsStr === null) return;
                const newTags = newTagsStr ? newTagsStr.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
                if (newName.trim() === object.name && JSON.stringify(newTags) === JSON.stringify(object.tags)) return;
                createProposal('edit-object', object.id, { name: newName.trim(), tags: newTags }, currentTopicId);
                showNotification('Edit proposal submitted for community voting');
            };
            editBtn.parentNode.insertBefore(proposeEditBtn, editBtn.nextSibling);
            proposeDeleteBtn = document.createElement('button');
            proposeDeleteBtn.id = proposeDeleteBtnId;
            proposeDeleteBtn.className = 'btn btn-small btn-danger';
            proposeDeleteBtn.textContent = 'Propose Delete';
            proposeDeleteBtn.onclick = function() {
                if (!confirm('Are you sure you want to propose deletion of this object?')) return;
                createProposal('delete-object', object.id, {}, currentTopicId);
                showNotification('Deletion proposal submitted for community voting');
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

function showObjectFromSearch(topicId, objectId) {
    currentTopicId = topicId;
    showObjectPage(objectId);
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

// Topic management
function showAddTopicForm() {
    if (!currentUser) {
        alert('Please login to add topics');
        return;
    }
    
    document.getElementById('add-topic-form').style.display = 'block';
    document.getElementById('topic-name').focus();
}

function hideAddTopicForm() {
    document.getElementById('add-topic-form').style.display = 'none';
    document.getElementById('topic-name').value = '';
}

function addTopic(event) {
    event.preventDefault();
    if (!currentUser) {
        alert('Please login to add topics');
        return;
    }
    if (!incrementDailyUsage('topics')) {
        return;
    }
    const topicName = document.getElementById('topic-name').value.trim();
    if (!topicName) return;
    // Prevent duplicate topic names (case-insensitive)
    if (data.topics.some(t => t.name.toLowerCase() === topicName.toLowerCase())) {
        alert('A topic with this name already exists. Please choose a different name.');
        return;
    }
    const topicId = generateId();
    const topic = {
        id: topicId,
        name: topicName,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.username,
        type: 'topic'
    };
    data.topics.push(topic);
    data.objects[topicId] = [];
    data.ratings[topicId] = {};
    saveData();
    renderTopics();
    hideAddTopicForm();
}

function renderTopics() {
    const grid = document.getElementById('topics-grid');
    
    if (data.topics.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No topics yet</h3>
                <p>Create your first topic to start ranking!</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = data.topics.map(topic => {
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

// Object management
function showAddObjectForm() {
    if (!currentUser) {
        alert('Please login to add objects');
        return;
    }
    
    document.getElementById('add-object-form').style.display = 'block';
    document.getElementById('object-name').focus();
}

function hideAddObjectForm() {
    document.getElementById('add-object-form').style.display = 'none';
    document.getElementById('object-name').value = '';
    document.getElementById('object-tags').value = '';
}

function addObject(event) {
    event.preventDefault();
    if (!currentUser) {
        alert('Please login to add objects');
        return;
    }
    if (!incrementDailyUsage('objects')) {
        return;
    }
    const objectName = document.getElementById('object-name').value.trim();
    const objectTags = document.getElementById('object-tags').value.trim();
    if (!objectName) return;
    // Prevent duplicate object names in the same topic (case-insensitive)
    if (data.objects[currentTopicId] && data.objects[currentTopicId].some(o => o.name.toLowerCase() === objectName.toLowerCase())) {
        alert('An object with this name already exists in this topic. Please choose a different name.');
        return;
    }
    const objectId = generateId();
    const object = {
        id: objectId,
        name: objectName,
        tags: objectTags ? objectTags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
        createdAt: new Date().toISOString(),
        createdBy: currentUser.username,
        type: 'object'
    };
    if (!data.objects[currentTopicId]) {
        data.objects[currentTopicId] = [];
    }
    data.objects[currentTopicId].push(object);
    data.ratings[currentTopicId][objectId] = [];
    saveData();
    renderObjects();
    hideAddObjectForm();
}

function renderObjects() {
    const grid = document.getElementById('objects-grid');
    const objects = data.objects[currentTopicId] || [];
    
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
        const ratings = data.ratings[currentTopicId][object.id] || [];
        const averageRating = calculateAverageRating(ratings);
        const ratingCount = ratings.length;
        
        return `
            <div class="object-card" onclick="showObjectPage('${object.id}')">
                <div class="card-owner">by ${escapeHtml(object.createdBy)}</div>
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

// Object details and rating
function renderObjectDetails() {
    const object = data.objects[currentTopicId].find(o => o.id === currentObjectId);
    const ratings = data.ratings[currentTopicId][currentObjectId] || [];
    const averageRating = calculateAverageRating(ratings);
    const ratingCount = ratings.length;
    
    // Render tags
    const tagsContainer = document.getElementById('object-tags-display');
    if (object.tags.length > 0) {
        tagsContainer.innerHTML = `
            <div class="tags">
                ${object.tags.map(tag => `<span class="tag clickable" onclick="searchByTag('${escapeHtml(tag)}', event)">${escapeHtml(tag)}</span>`).join('')}
            </div>
        `;
    } else {
        tagsContainer.innerHTML = '';
    }
    
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
}

function renderReviews() {
    const reviewsList = document.getElementById('reviews-list');
    const ratings = data.ratings[currentTopicId][currentObjectId] || [];
    
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
    const sortedRatings = [...ratings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    reviewsList.innerHTML = sortedRatings.map((rating, index) => `
        <div class="review-item">
            <div class="review-owner">by ${escapeHtml(rating.createdBy)}</div>
            ${currentUser && rating.createdBy === currentUser.username ? `
                <div class="review-actions">
                    <button class="btn btn-small btn-secondary" onclick="editReview(${index})">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            ` : ''}
            <div class="review-header">
                <span class="review-rating">${renderStars(rating.rating)}</span>
                <span class="review-date">${formatDate(rating.createdAt)}</span>
            </div>
            ${rating.review ? `<div class="review-text">${escapeHtml(rating.review)}</div>` : ''}
        </div>
    `).join('');
}

function editReview(index) {
    const ratings = data.ratings[currentTopicId][currentObjectId] || [];
    const rating = ratings[index];
    
    if (!rating || rating.createdBy !== currentUser.username) {
        return;
    }
    
    editingReview = { index, rating };
    
    // Fill the rating form with existing values
    selectedRating = rating.rating;
    updateStarDisplay();
    document.getElementById('review-text').value = rating.review || '';
    
    // Update button text
    document.getElementById('submit-rating-btn').textContent = 'Update Rating';
    
    showNotification('Editing mode - modify your rating and review, then submit');
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

function submitRating() {
    if (!currentUser) {
        alert('Please login to submit ratings');
        return;
    }
    if (selectedRating === 0) {
        alert('Please select a rating');
        return;
    }
    if (editingReview) {
        // Update existing review
        const ratings = data.ratings[currentTopicId][currentObjectId];
        const reviewText = document.getElementById('review-text').value.trim();
        ratings[editingReview.index] = {
            ...editingReview.rating,
            rating: selectedRating,
            review: reviewText,
            lastModified: new Date().toISOString()
        };
        saveData();
        renderObjectDetails();
        renderReviews();
        resetRatingForm();
        showNotification('Rating updated successfully!');
        return;
    }
    // Check weekly limit for new ratings
    const now = new Date();
    const ratings = data.ratings[currentTopicId][currentObjectId] || [];
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recent = ratings.find(r => r.createdBy === currentUser.username && new Date(r.createdAt) > lastWeek);
    if (recent) {
        alert('You can only rate the same object once per week.');
        return;
    }
    if (!incrementDailyUsage('ratings')) {
        return;
    }
    const reviewText = document.getElementById('review-text').value.trim();
    const rating = {
        rating: selectedRating,
        review: reviewText,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.username
    };
    if (!data.ratings[currentTopicId][currentObjectId]) {
        data.ratings[currentTopicId][currentObjectId] = [];
    }
    data.ratings[currentTopicId][currentObjectId].push(rating);
    saveData();
    renderObjectDetails();
    renderReviews();
    resetRatingForm();
    // Show success message
    showNotification('Rating submitted successfully!');
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
function showUserSpacePage() {
    hideAllPages();
    document.getElementById('user-space-page').classList.add('active');
    renderUserSpacePage();
}

function renderUserSpacePage() {
    const container = document.getElementById('user-space-content');
    let html = `
        <div class="user-space-main">
            <h2>User Space</h2>
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
                    <button type="submit" class="btn btn-primary">Update Info</button>
                </div>
            </form>
            <hr>
            <h3>Today's Activity</h3>
            <div id="user-daily-activity"></div>
        </div>
    `;
    container.innerHTML = html;
    renderUserDailyActivity();
}

function updateUserInfo(event) {
    event.preventDefault();
    const newUsername = document.getElementById('user-space-username').value.trim();
    const newEmail = document.getElementById('user-space-email').value.trim();
    if (!newUsername || !newEmail) {
        alert('Username and email cannot be empty');
        return;
    }
    // Prevent duplicate username (if changed)
    if (newUsername !== currentUser.username && data.users[newUsername]) {
        alert('Username already exists');
        return;
    }
    // Prevent duplicate email (if changed)
    for (const userKey in data.users) {
        if (userKey !== currentUser.username && data.users[userKey].email === newEmail) {
            alert('Email already registered');
            return;
        }
    }
    // Update user info
    const oldUsername = currentUser.username;
    if (newUsername !== oldUsername) {
        // Move user data to new username key
        data.users[newUsername] = { ...currentUser, username: newUsername, email: newEmail };
        delete data.users[oldUsername];
        // Update references in dailyUsage
        if (data.dailyUsage[oldUsername]) {
            data.dailyUsage[newUsername] = data.dailyUsage[oldUsername];
            delete data.dailyUsage[oldUsername];
        }
        // Update createdBy in topics, objects, ratings, proposals
        data.topics.forEach(t => { if (t.createdBy === oldUsername) t.createdBy = newUsername; });
        Object.values(data.objects).forEach(objArr => objArr.forEach(o => { if (o.createdBy === oldUsername) o.createdBy = newUsername; }));
        Object.values(data.ratings).forEach(topicRatings => {
            Object.values(topicRatings).forEach(rArr => rArr.forEach(r => { if (r.createdBy === oldUsername) r.createdBy = newUsername; }));
        });
        Object.values(data.proposals).forEach(p => { if (p.proposedBy === oldUsername) p.proposedBy = newUsername; if (p.votes[oldUsername]) { p.votes[newUsername] = p.votes[oldUsername]; delete p.votes[oldUsername]; } });
        currentUser = data.users[newUsername];
        localStorage.setItem('currentUser', newUsername);
    } else {
        data.users[newUsername].email = newEmail;
        currentUser = data.users[newUsername];
    }
    saveData();
    updateUserInterface();
    showNotification('User info updated successfully!');
}

function renderUserDailyActivity() {
    const container = document.getElementById('user-daily-activity');
    if (!currentUser) { container.innerHTML = ''; return; }
    const today = new Date().toDateString();
    let activity = [];
    // Topics created
    data.topics.forEach(t => {
        if (t.createdBy === currentUser.username && new Date(t.createdAt).toDateString() === today) {
            activity.push({
                type: 'Created Topic',
                name: t.name,
                time: t.createdAt
            });
        }
        if (t.modifiedBy === currentUser.username && t.lastModified && new Date(t.lastModified).toDateString() === today) {
            activity.push({
                type: 'Modified Topic',
                name: t.name,
                time: t.lastModified
            });
        }
    });
    // Topics deleted (look for proposals executed by user or proposals for deletion by user)
    Object.values(data.proposals).forEach(p => {
        if (p.type === 'delete-topic' && p.proposedBy === currentUser.username && new Date(p.createdAt).toDateString() === today) {
            activity.push({
                type: 'Proposed Delete Topic',
                name: (data.topics.find(t => t.id === p.targetId) || {name: '[Deleted Topic]'}).name,
                time: p.createdAt
            });
        }
        if ((p.type === 'edit-topic' || p.type === 'edit-object') && p.proposedBy === currentUser.username && new Date(p.createdAt).toDateString() === today) {
            activity.push({
                type: p.type === 'edit-topic' ? 'Proposed Edit Topic' : 'Proposed Edit Object',
                name: p.changes.name || '[Unnamed]',
                time: p.createdAt
            });
        }
    });
    // Objects created/modified
    Object.keys(data.objects).forEach(topicId => {
        (data.objects[topicId] || []).forEach(o => {
            if (o.createdBy === currentUser.username && new Date(o.createdAt).toDateString() === today) {
                activity.push({
                    type: 'Created Object',
                    name: o.name,
                    time: o.createdAt
                });
            }
            if (o.modifiedBy === currentUser.username && o.lastModified && new Date(o.lastModified).toDateString() === today) {
                activity.push({
                    type: 'Modified Object',
                    name: o.name,
                    time: o.lastModified
                });
            }
        });
    });
    // Objects deleted (proposals)
    Object.values(data.proposals).forEach(p => {
        if (p.type === 'delete-object' && p.proposedBy === currentUser.username && new Date(p.createdAt).toDateString() === today) {
            activity.push({
                type: 'Proposed Delete Object',
                name: (data.objects[p.topicId]||[]).find(o=>o.id===p.targetId)?.name || '[Deleted Object]',
                time: p.createdAt
            });
        }
    });
    // Ratings (as before)
    let ratings = [];
    Object.keys(data.ratings).forEach(topicId => {
        Object.keys(data.ratings[topicId] || {}).forEach(objectId => {
            (data.ratings[topicId][objectId] || []).forEach(r => {
                if (r.createdBy === currentUser.username && new Date(r.createdAt).toDateString() === today) {
                    ratings.push({ ...r, topicId, objectId });
                }
            });
        });
    });
    ratings.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    ratings.forEach(r => {
        activity.push({
            type: 'Rated Object',
            name: (data.objects[r.topicId]?.find(o => o.id === r.objectId)?.name || 'Object'),
            time: r.createdAt,
            extra: `Score: ${r.rating}`
        });
    });
    // Proposal votes (approval/opposition)
    Object.values(data.proposals).forEach(p => {
        if (p.votes && p.votes[currentUser.username]) {
            const voteTime = p.voteTimes && p.voteTimes[currentUser.username] ? p.voteTimes[currentUser.username] : p.createdAt;
            if (new Date(voteTime).toDateString() === today) {
                activity.push({
                    type: p.votes[currentUser.username] === 'agree' ? 'Approved Proposal' : 'Opposed Proposal',
                    name: `${p.type.replace('-', ' ')} by ${p.proposedBy}`,
                    time: voteTime
                });
            }
        }
    });
    // Sort by time
    activity.sort((a, b) => new Date(a.time) - new Date(b.time));
    let html = '';
    if (activity.length > 0) {
        html += `<ul class='user-activity-list'>` + activity.map(act => `<li><strong>${act.type}:</strong> ${escapeHtml(act.name)}${act.extra ? ' <span style="color:#888">(' + act.extra + ')</span>' : ''} <span class='activity-time'>(${formatDate(act.time)})</span></li>`).join('') + `</ul>`;
    } else {
        html = '<div>No activity today.</div>';
    }
    container.innerHTML = html;
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

function renderAdminPanel() {
    const modal = document.getElementById('admin-panel-modal');
    let html = `<div class='modal-content admin-panel-modal-content'><div class='modal-header'><h2>Admin Panel</h2><button class='modal-close' onclick='closeAdminPanel()'><i class='fas fa-times'></i></button></div><div class='modal-body'><h3>All Users</h3><div id='admin-users-list'></div></div></div>`;
    modal.innerHTML = html;
    renderAdminUsersList();
}

function renderAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    let html = '<table style="width:100%;border-collapse:collapse;"><tr><th>Username</th><th>Email</th><th>Actions</th></tr>';
    for (const username in data.users) {
        const user = data.users[username];
        html += `<tr><td>${escapeHtml(user.username)}${user.isAdmin ? ' <span style=\'color:red;font-weight:bold\'>(Admin)</span>' : ''}</td><td>${escapeHtml(user.email)}</td><td>`;
        if (!user.isAdmin) {
            html += `<button class='btn btn-small btn-secondary' onclick='adminEditUser("${user.username}")'>Edit</button> <button class='btn btn-small btn-danger' onclick='adminDeleteUser("${user.username}")'>Delete</button>`;
        } else {
            html += '-';
        }
        html += '</td></tr>';
    }
    html += '</table>';
    container.innerHTML = html;
}

function adminEditUser(username) {
    const user = data.users[username];
    if (!user) return;
    const newEmail = prompt('Edit email for ' + username, user.email);
    if (!newEmail) return;
    user.email = newEmail;
    saveData();
    renderAdminUsersList();
    showNotification('User updated by admin');
}

function adminDeleteUser(username) {
    if (!confirm('Delete user ' + username + '? This cannot be undone.')) return;
    delete data.users[username];
    saveData();
    renderAdminUsersList();
    showNotification('User deleted by admin');
}

// Admin direct edit/delete for topics/objects/users
function isAdmin() { return currentUser && currentUser.isAdmin; }

// Admin proposal actions
function adminApproveProposal(proposalId) {
    if (!isAdmin()) return;
    executeProposal(proposalId);
    showNotification('Proposal approved and executed by admin');
    renderProposals();
}

function adminVetoProposal(proposalId) {
    if (!isAdmin()) return;
    delete data.proposals[proposalId];
    saveData();
    updateProposalCount();
    showNotification('Proposal vetoed and removed by admin');
    renderProposals();
}

// Add global for selected time range
let objectStatsSelectedRange = null;
let objectStatsGranularity = 'day';
function showObjectStatsPage() {
    hideAllPages();
    document.getElementById('object-stats-page').classList.add('active');
    renderObjectStatsPage();
}
function renderObjectStatsPage() {
    const container = document.getElementById('object-stats-content');
    const object = data.objects[currentTopicId].find(o => o.id === currentObjectId);
    const ratings = data.ratings[currentTopicId][currentObjectId] || [];
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
        const key = formatDate(r.createdAt, granularity);
        if (!timeBuckets[key]) timeBuckets[key] = [];
        timeBuckets[key].push({rating: r.rating, createdAt: r.createdAt});
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
            const t = new Date(r.createdAt).getTime();
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
}

function updateProposalCount() {
    const count = Object.keys(data.proposals).length;
    const proposalCountElem = document.getElementById('proposal-count');
    if (proposalCountElem) {
        proposalCountElem.textContent = count;
        proposalCountElem.style.display = count > 0 ? 'inline' : 'none';
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
} 