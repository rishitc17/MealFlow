document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:8000/'; // Backend API host running on FastAPI Cloud
    const page = window.location.pathname.split('/').pop();

    // --- AUTHENTICATION & DATA MGMT ---
    // --- STORAGE & USER HELPERS ---
    // Use sessionStorage for current session data and backend (Appwrite) for persistent user records
    const getCurrentUserEmail = () => sessionStorage.getItem('mealFlowCurrentUser');
    const setCurrentUserEmail = (email) => sessionStorage.setItem('mealFlowCurrentUser', email);
    const logoutUser = () => {
        sessionStorage.removeItem('mealFlowCurrentUser');
        sessionStorage.removeItem('mealFlowUser');
        sessionStorage.removeItem('mealFlowPantry');
    };

    const getCurrentUser = () => {
        try {
            return JSON.parse(sessionStorage.getItem('mealFlowUser') || 'null');
        } catch (e) {
            return null;
        }
    };

    const setCurrentUser = (user) => {
        if (!user) return;
        sessionStorage.setItem('mealFlowUser', JSON.stringify(user));
        if (user.email) setCurrentUserEmail(user.email);
    };

    // --- Pantry (sessionStorage) helpers ---
    const PANTRY_KEY = 'mealFlowPantry';
    const getSessionPantry = () => {
        try {
            return JSON.parse(sessionStorage.getItem(PANTRY_KEY) || 'null') || { ingredients: [], mealType: 'Dinner' };
        } catch (e) {
            return { ingredients: [], mealType: 'Dinner' };
        }
    };
    const setSessionPantry = (p) => sessionStorage.setItem(PANTRY_KEY, JSON.stringify(p));

    // Backend helper to fetch user and update session cache
    const fetchUserFromBackend = async (email) => {
        try {
            const resp = await fetch(`${API_BASE_URL}/user?email=${encodeURIComponent(email)}`);
            if (!resp.ok) return null;
            const data = await resp.json();
            // normalize to expected shape
            const user = { name: data.name, email: data.email, family: data.family || [], id: data.id };
            setCurrentUser(user);
            return user;
        } catch (e) {
            console.error('Failed to fetch user from backend', e);
            return null;
        }
    };

    // --- INGREDIENT DATA (Loaded from CSV) ---
    let ingredientsData = {}; // Will be populated by loadIngredientsFromCSV

    async function loadIngredientsFromCSV() {
        try {
            const response = await fetch('ingredients.csv');
            const csvText = await response.text();
            const lines = csvText.trim().split('\n');
            const headers = lines[0].split(',');

            const data = {};

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                const row = {};
                headers.forEach((header, idx) => {
                    row[header.trim()] = values[idx]?.trim() || '';
                });

                const section = row.section || 'Other';
                if (!data[section]) data[section] = [];

                data[section].push({
                    english_name: row.english_name,
                    hinglish_name: row.hinglish_name,
                    hindi_name: row.hindi_name,
                    section: section,
                });
            }

            ingredientsData = data;
        } catch (error) {
            console.error('Error loading ingredients from CSV:', error);
            ingredientsData = {}; // Fallback to empty
        }
    }

    // Load ingredients on page start
    loadIngredientsFromCSV();

    // --- ROUTING & PAGE INIT ---
    const protectedPages = ['dashboard.html', 'family.html', 'recipe.html'];
    if (protectedPages.includes(page) && !getCurrentUserEmail()) {
        window.location.href = 'index.html';
        return; // Stop further execution
    }

    // --- NAVBAR INJECTION & UI ---
    // Load navbar on protected pages and index.html if logged in
    if (getCurrentUserEmail()) {
        loadNavbar();
    } else if (page !== 'index.html' && page !== '') {
        loadNavbar();
    }

    async function loadNavbar() {
        const navbarPlaceholder = document.getElementById('navbar-placeholder');
        // Only load the navbar on pages that have the placeholder
        if (navbarPlaceholder) {
            try {
                const response = await fetch('_navbar.html');
                const navbarHTML = await response.text();
                navbarPlaceholder.innerHTML = navbarHTML;
                setupNavbar();
            } catch (error) {
                console.error('Error loading navbar:', error);
            }
        }
    }

    function setupNavbar() {
        const user = getCurrentUser();
        const page = window.location.pathname.split('/').pop();

        // --- Elements ---
        const userNameSpan = document.getElementById('user-name');
        const mobileUserNameSpan = document.getElementById('mobile-user-name');
        const logoutBtn = document.getElementById('logout-btn');
        const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuIcon = document.getElementById('mobile-menu-icon');
        const navLinks = document.querySelectorAll('.nav-link');
        const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

        // --- User Info ---
        if (user) {
            if (userNameSpan) userNameSpan.textContent = `Hi, ${user.name}!`;
            if (mobileUserNameSpan) mobileUserNameSpan.textContent = user.name;

            const handleLogout = () => {
                logoutUser();
                window.location.href = 'index.html';
            };
            if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
            if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', handleLogout);
        }

        // --- Mobile Menu Toggle ---
        if (mobileMenuBtn && mobileMenu && mobileMenuIcon) {
            mobileMenuBtn.addEventListener('click', () => {
                const isHidden = mobileMenu.classList.toggle('hidden');
                mobileMenuIcon.classList.toggle('fa-bars');
                mobileMenuIcon.classList.toggle('fa-xmark');
            });
        }

        // --- Desktop Active Link Highlighting (underline) ---
        navLinks.forEach((link) => {
            if (link.getAttribute('data-page') === page) {
                link.classList.add('text-[#FF9800]', 'border-b-2', 'border-[#FF9800]');
                link.classList.remove('text-gray-600');
            }
        });

        // --- Mobile Active Link Highlighting (colored tab/background) ---
        mobileNavLinks.forEach((link) => {
            if (link.getAttribute('data-page') === page) {
                link.classList.add('bg-[#FFF3E0]', 'text-[#FF9800]', 'font-medium');
                link.classList.remove('text-gray-600');
            }
        });

        // Hide header on index.html when logged in (navbar is shown instead)
        if ((page === 'index.html' || page === '') && user) {
            const header = document.querySelector('header');
            if (header) {
                header.classList.add('hidden');
            }
        }

        // FontAwesome is linked in the HTML directly, no JS rendering needed here
    }

    // ===================================
    // 1. HOME / LOGIN PAGE (index.html)
    // ===================================
    function initHomePage() {
        const authModal = document.getElementById('auth-modal');
        const showLoginBtn = document.getElementById('show-login-btn');
        const showSignupBtn = document.getElementById('show-signup-btn');
        const closeModalBtn = document.getElementById('close-modal-btn');
        const loginSection = document.getElementById('login-section');
        const signupSection = document.getElementById('signup-section');
        const switchToSignupBtn = document.getElementById('switch-to-signup');
        const switchToLoginBtn = document.getElementById('switch-to-login');

        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');

        // Show login modal
        if (showLoginBtn) {
            showLoginBtn.addEventListener('click', () => {
                authModal.classList.remove('hidden');
                loginSection.classList.remove('hidden');
                signupSection.classList.add('hidden');
            });
        }

        // Show signup modal
        if (showSignupBtn) {
            showSignupBtn.addEventListener('click', () => {
                authModal.classList.remove('hidden');
                signupSection.classList.remove('hidden');
                loginSection.classList.add('hidden');
            });
        }

        // Close modal
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                authModal.classList.add('hidden');
            });
        }

        // Switch to signup from login
        if (switchToSignupBtn) {
            switchToSignupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                loginSection.classList.add('hidden');
                signupSection.classList.remove('hidden');
            });
        }

        // Switch to login from signup
        if (switchToLoginBtn) {
            switchToLoginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                signupSection.classList.add('hidden');
                loginSection.classList.remove('hidden');
            });
        }

        // Login form submission (now requires email + password and uses backend)
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('modal-login-email').value;
                const password = document.getElementById('modal-login-password').value;
                try {
                    const resp = await fetch(`${API_BASE_URL}/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password }),
                    });
                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        alert(err.detail || 'Login failed');
                        return;
                    }
                    const user = await resp.json();
                    setCurrentUser(user);
                    window.location.href = 'family.html';
                } catch (err) {
                    console.error('Login error', err);
                    alert('Login failed. Check console for details.');
                }
            });
        }

        // Signup form submission (saves to backend DB)
        if (signupForm) {
            signupForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const consentCheckbox = document.getElementById('consent-checkbox');
                if (!consentCheckbox || !consentCheckbox.checked) {
                    consentCheckbox?.focus();
                    alert('You must consent to sign up.');
                    return;
                }
                const name = document.getElementById('modal-signup-name').value;
                const email = document.getElementById('modal-signup-email').value;
                const password = document.getElementById('modal-signup-password').value;
                try {
                    const resp = await fetch(`${API_BASE_URL}/signup`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, email, password }),
                    });
                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        alert(err.detail || 'Signup failed');
                        return;
                    }
                    // fetch user record and set session
                    const user = await fetchUserFromBackend(email);
                    if (user) {
                        setCurrentUser(user);
                        window.location.href = 'family.html';
                    } else {
                        // fallback: set basic user
                        setCurrentUser({ name, email, family: [] });
                        window.location.href = 'family.html';
                    }
                } catch (err) {
                    console.error('Signup error', err);
                    alert('Signup failed. Check console for details.');
                }
            });
        }
    }

    // ===================================
    // 2. FAMILY PAGE (family.html)
    // ===================================
    function initFamilyPage() {
        const form = document.getElementById('family-form');
        const listContainer = document.getElementById('family-list-container');
        const memberIdInput = document.getElementById('member-id');
        const submitBtn = document.getElementById('submit-btn');
        const formTitle = document.getElementById('form-title');
        const dashboardLink = document.getElementById('dashboard-link');
        const clearBtn = document.getElementById('clear-btn');

        // Guard: Ensure all critical elements exist
        if (!form || !listContainer || !memberIdInput || !submitBtn || !formTitle) {
            console.error('Family page: Missing required form elements');
            return;
        }

        const calculateAge = (birthday) => {
            if (!birthday) return 'N/A';
            const birthDate = new Date(birthday);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            return age;
        };

        const renderFamilyList = () => {
            const user = getCurrentUser();
            if (!user) return;

            listContainer.innerHTML = ''; // Clear previous list
            if (user.family.length === 0) {
                listContainer.innerHTML = `
                    <div class="text-center bg-white p-8 rounded-2xl shadow">
                        <h3 class="text-xl font-semibold">No family members yet!</h3>
                        <p class="text-gray-500 mt-2">Use the form on the left to add your first family member.</p>
                    </div>`;
                dashboardLink.classList.add('hidden'); // Hide button if no members
                return;
            }

            dashboardLink.classList.remove('hidden'); // Show button if members exist

            user.family.forEach((member) => {
                const age = calculateAge(member.birthday);
                const card = document.createElement('div');
                card.className =
                    'bg-white p-5 rounded-2xl shadow-lg flex justify-between items-start transition-transform hover:scale-105';
                card.innerHTML = `
                    <div class="space-y-2 flex-grow">
                        <h4 class="font-bold text-xl text-[#1C1C1C]">${member.name} <span class="text-gray-500 font-medium">(${age} yrs)</span></h4>
                        <p class="text-sm"><span class="font-semibold text-gray-600">Diet:</span> ${member.dietary_preference}</p>
                        <p class="text-sm"><span class="font-semibold text-gray-600">Health Goals:</span> ${member.health_goals || 'None'}</p>
                        <p class="text-sm"><span class="font-semibold text-gray-600">Food Dislikes:</span> ${member.dislikes || 'None'}</p>
                        <p class="text-sm"><span class="font-semibold text-gray-600">Allergies:</span> ${member.allergies || 'None'}</p>
                        <p class="text-sm"><span class="font-semibold text-gray-600">Medical Conditions:</span> ${member.medical_conditions || 'None'}</p>
                        <p class="text-sm"><span class="font-semibold text-gray-600">Religious Preferences:</span> ${member.religious_preferences || 'None'}</p>
                    </div>
                    <div class="flex items-center space-x-2 ml-4">
                        <button data-id="${member.id}" class="edit-btn p-2 rounded-full hover:bg-blue-100 transition-colors" title="Edit ${member.name}">
                            <i class="w-5 h-5 text-[#5BB0D9] fas fa-pencil-alt"></i>
                        </button>
                        <button data-id="${member.id}" class="delete-btn p-2 rounded-full hover:bg-red-100 transition-colors" title="Delete ${member.name}">
                            <i class="w-5 h-5 text-red-500 fas fa-trash"></i>
                        </button>
                    </div>
                `;
                listContainer.appendChild(card);
            });
        };

        const resetForm = () => {
            form.reset();
            memberIdInput.value = '';
            formTitle.textContent = 'Add a New Member';
            submitBtn.textContent = 'Add Member';
            submitBtn.classList.replace('bg-[#5BB0D9]', 'bg-[#FF9800]');
            submitBtn.classList.replace('hover:bg-[#7EC8E3]', 'hover:bg-[#2A76A0]');
        };

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = getCurrentUser();
            const memberData = {
                id: memberIdInput.value || Date.now().toString(),
                name: document.getElementById('name').value,
                birthday: document.getElementById('birthday').value,
                dietary_preference: document.getElementById('diet').value,
                health_goals: document.getElementById('health_goals').value,
                dislikes: document.getElementById('dislikes').value,
                allergies: document.getElementById('allergies').value,
                medical_conditions: document.getElementById('medical_conditions').value,
                religious_preferences: document.getElementById('religious_preferences').value,
            };

            if (memberIdInput.value) {
                // Editing
                const index = user.family.findIndex((m) => m.id === memberIdInput.value);
                if (index > -1) user.family[index] = memberData;
            } else {
                // Adding
                user.family.push(memberData);
            }

            // Persist to backend and update session cache
            (async () => {
                try {
                    const resp = await fetch(`${API_BASE_URL}/save_family`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: user.email, family: user.family }),
                    });
                    if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        alert(err.detail || 'Failed to save family.');
                        return;
                    }
                    // update session cache
                    setCurrentUser(user);
                    renderFamilyList();
                    resetForm();
                } catch (e) {
                    console.error('Error saving family:', e);
                    alert('Error saving family. See console.');
                }
            })();
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', resetForm);
        }

        listContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const id = btn.dataset.id;
            const user = getCurrentUser();

            if (btn.classList.contains('delete-btn')) {
                if (confirm('Are you sure you want to delete this family member?')) {
                    user.family = user.family.filter((m) => m.id !== id);
                    (async () => {
                        try {
                            const resp = await fetch(`${API_BASE_URL}/save_family`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email: user.email, family: user.family }),
                            });
                            if (!resp.ok) {
                                const err = await resp.json().catch(() => ({}));
                                alert(err.detail || 'Failed to delete member.');
                                return;
                            }
                            setCurrentUser(user);
                            renderFamilyList();
                        } catch (e) {
                            console.error('Error deleting member:', e);
                            alert('Error deleting member. See console.');
                        }
                    })();
                }
            } else if (btn.classList.contains('edit-btn')) {
                const member = user.family.find((m) => m.id === id);
                if (member) {
                    memberIdInput.value = member.id;
                    document.getElementById('name').value = member.name;
                    document.getElementById('birthday').value = member.birthday;
                    document.getElementById('diet').value = member.dietary_preference;
                    document.getElementById('health_goals').value = member.health_goals || '';
                    document.getElementById('dislikes').value = member.dislikes || '';
                    document.getElementById('allergies').value = member.allergies || '';
                    document.getElementById('medical_conditions').value = member.medical_conditions || '';
                    document.getElementById('religious_preferences').value = member.religious_preferences || '';

                    formTitle.textContent = `Editing ${member.name}`;
                    submitBtn.textContent = 'Update Member';
                    submitBtn.classList.replace('bg-[#FF9800]', 'bg-[#5BB0D9]');
                    submitBtn.classList.replace('hover:bg-[#C66E00]', 'hover:bg-[#2A76A0]');

                    form.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });

        renderFamilyList();
    }

    // ===================================
    // 3. DASHBOARD PAGE (dashboard.html)
    // ===================================
    function initDashboardPage() {
        console.log('initDashboardPage called');
        const user = getCurrentUser();
        console.log('Current user:', user);
        // Use application-wide session pantry (no per-user key required)
        const pantry = getSessionPantry();

        const listContainer = document.getElementById('ingredient-list-container');
        const previewContainer = document.getElementById('selected-ingredients-preview');
        const searchInput = document.getElementById('ingredient-search');
        const mealTypeSelector = document.getElementById('meal-type-selector');
        const generateLink = document.getElementById('generate-link');

        let currentLanguage = 'english'; // 'english', 'hinglish', 'hindi'
        let mostUsed = {}; // Will be populated from user data

        // Load most_used from user data
        const loadMostUsed = async () => {
            if (!user || !user.email) return;
            try {
                const resp = await fetch(`${API_BASE_URL}/user?email=${encodeURIComponent(user.email)}`);
                if (resp.ok) {
                    const data = await resp.json();
                    const mostUsedStr = data.most_used || '{}';
                    mostUsed = JSON.parse(mostUsedStr);
                    console.log('Loaded mostUsed:', mostUsed);
                } else {
                    console.error('Failed to fetch user:', resp.statusText);
                }
            } catch (e) {
                console.error('Error loading most_used:', e);
            }
        };

        // Save ingredients to backend when Generate Meal is clicked
        if (generateLink) {
            generateLink.addEventListener('click', async (e) => {
                if (!user || !user.email || pantry.ingredients.length === 0) return;
                try {
                    await fetch(`${API_BASE_URL}/save_ingredients`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: user.email, ingredients: pantry.ingredients }),
                    });
                    // After saving, reload most_used and update Recents
                    await loadMostUsed();
                    injectRecentsIntoIngredients();
                    renderIngredients(searchInput.value);
                } catch (e) {
                    console.error('Error saving ingredients:', e);
                }
            });
        }

        // Create language toggle if not already in HTML
        const createLanguageToggle = () => {
            const existingToggle = document.getElementById('language-toggle');
            if (existingToggle) return;

            const toggleDiv = document.createElement('div');
            toggleDiv.id = 'language-toggle';
            toggleDiv.className = 'flex gap-2 mb-6 flex-wrap';
            toggleDiv.innerHTML = `
                <button data-lang="english" class="lang-btn px-4 py-2 rounded-lg font-medium transition-colors selected bg-[#5BB0D9] text-white">English</button>
                <button data-lang="hinglish" class="lang-btn px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-800 hover:bg-gray-300">Hinglish</button>
                <button data-lang="hindi" class="lang-btn px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-800 hover:bg-gray-300">हिंदी</button>
            `;

            // Insert toggle before the search input
            searchInput.parentElement.insertBefore(toggleDiv, searchInput);

            // Add language toggle event listeners
            document.querySelectorAll('.lang-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    document.querySelectorAll('.lang-btn').forEach((b) => {
                        b.classList.remove('selected', 'bg-[#5BB0D9]', 'text-white');
                        b.classList.add('bg-gray-200', 'text-gray-800');
                    });
                    e.target.classList.add('selected', 'bg-[#5BB0D9]', 'text-white');
                    e.target.classList.remove('bg-gray-200', 'text-gray-800');
                    currentLanguage = e.target.dataset.lang;
                    renderIngredients(searchInput.value);
                    renderPreview(); // Update ingredient names in preview
                });
            });
        };

        const getIngredientName = (ingredient) => {
            if (currentLanguage === 'hinglish') return ingredient.hinglish_name;
            if (currentLanguage === 'hindi') return ingredient.hindi_name;
            return ingredient.english_name;
        };

        // Get the key used to store ingredients (using english name as the standard)
        const getIngredientKey = (ingredient) => {
            return ingredient.english_name;
        };

        // Get top recent ingredients with frequency threshold
        // Inject Recents section into ingredientsData based on mostUsed (top 10 by usage)
        const injectRecentsIntoIngredients = () => {
            const recentsList = [];
            // Collect all ingredients with their usage count
            for (const [engName, count] of Object.entries(mostUsed)) {
                // Find the ingredient in ingredientsData
                for (const section of Object.values(ingredientsData)) {
                    const ing = section.find((i) => i.english_name === engName);
                    if (ing) {
                        recentsList.push({ ...ing, count });
                        break;
                    }
                }
            }

            // Sort by count descending and take top 10
            recentsList.sort((a, b) => b.count - a.count);
            const topRecents = recentsList.slice(0, 10);

            // If there are recents, add them as a section at the top
            if (topRecents.length > 0) {
                const newData = { Recents: topRecents };
                // Add all other sections
                for (const [sectionName, items] of Object.entries(ingredientsData)) {
                    newData[sectionName] = items;
                }
                ingredientsData = newData;
            }
        };

        const renderIngredients = (filter = '') => {
            listContainer.innerHTML = '';
            const filterLower = filter.toLowerCase();

            Object.keys(ingredientsData).forEach((section) => {
                const items = ingredientsData[section];
                const filtered = items.filter((ing) => {
                    const searchStr = `${ing.english_name} ${ing.hinglish_name} ${ing.hindi_name}`.toLowerCase();
                    return searchStr.includes(filterLower);
                });

                if (filtered.length > 0) {
                    const sectionDiv = document.createElement('div');
                    sectionDiv.className = 'mb-6';
                    const sectionTitle = section === 'Recents' ? 'Recents' : section;
                    const sectionClass = section === 'Recents' ? 'text-orange-600' : 'text-gray-700';
                    sectionDiv.innerHTML = `<h3 class="text-xl font-bold mb-4 ${sectionClass}">${sectionTitle}</h3>`;

                    const list = document.createElement('div');
                    list.className = 'space-y-2';

                    filtered.forEach((ingredient) => {
                        const key = getIngredientKey(ingredient);
                        const isChecked = pantry.ingredients.includes(key);
                        const displayName = getIngredientName(ingredient);
                        const countText = ingredient.count ? ` (used ${ingredient.count}x)` : '';

                        const row = document.createElement('div');
                        row.className = `ingredient-row p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            isChecked
                                ? 'bg-orange-100 border-orange-500'
                                : 'bg-white border-gray-200 hover:border-orange-300'
                        }`;
                        row.dataset.ingredient = key;
                        row.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex-grow">
                                    <span class="font-medium text-gray-800">${displayName}</span>
                                    ${countText ? `<span class="text-xs text-gray-500 ml-2">${countText}</span>` : ''}
                                </div>
                                <i class="w-5 h-5 ${isChecked ? 'text-orange-500 fas fa-check-circle' : 'text-gray-300 fas fa-circle'}"></i>
                            </div>
                        `;

                        row.addEventListener('click', () => {
                            const isCurrentlyChecked = pantry.ingredients.includes(key);
                            if (isCurrentlyChecked) {
                                pantry.ingredients = pantry.ingredients.filter((i) => i !== key);
                            } else {
                                pantry.ingredients.push(key);
                            }
                            setSessionPantry(pantry);
                            renderIngredients(searchInput.value);
                            renderPreview();
                        });

                        list.appendChild(row);
                    });

                    sectionDiv.appendChild(list);
                    listContainer.appendChild(sectionDiv);
                }
            });
        };

        const renderPreview = () => {
            previewContainer.innerHTML = '';
            if (pantry.ingredients.length === 0) {
                previewContainer.innerHTML = '<p class="text-gray-400">Select ingredients to see them here.</p>';
                return;
            }
            const list = document.createElement('div');
            list.className = 'flex flex-wrap gap-2';
            pantry.ingredients.forEach((ingKey) => {
                // Find the ingredient to get its display name
                let displayName = ingKey;
                outer: for (const section of Object.values(ingredientsData)) {
                    for (const ing of section) {
                        if (ing.english_name === ingKey) {
                            displayName = getIngredientName(ing);
                            break outer;
                        }
                    }
                }
                list.innerHTML += `<span class="bg-orange-100 text-orange-800 text-sm font-semibold px-3 py-1 rounded-full">${displayName}</span>`;
            });
            previewContainer.appendChild(list);
        };

        const updateMealTypeSelection = () => {
            document.querySelectorAll('.meal-type-label').forEach((label) => {
                const input = label.querySelector('input');
                if (input.value === pantry.mealType) {
                    label.classList.add('selected');
                    input.checked = true;
                } else {
                    label.classList.remove('selected');
                }
            });
        };

        // Initialize dashboard - await loading data first
        (async () => {
            await loadMostUsed();
            injectRecentsIntoIngredients(); // Inject Recents as a normal section
            createLanguageToggle();
            searchInput.addEventListener('input', () => renderIngredients(searchInput.value));

            mealTypeSelector.addEventListener('change', (e) => {
                pantry.mealType = e.target.value;
                setSessionPantry(pantry);
                updateMealTypeSelection();
            });

            renderIngredients();
            renderPreview();
            updateMealTypeSelection();
        })();
    }

    // ===================================
    // 4. RECIPE PAGE (recipe.html)
    // ===================================
    function initRecipePage() {
        const recipeContainer = document.getElementById('recipe-container');
        const loadingDiv = document.getElementById('loading-state');
        const errorDiv = document.getElementById('error-state');
        // read pantry from sessionStorage (accessible to renderRecipe)
        let pantry = getSessionPantry();

        const fetchAndRenderRecipe = async () => {
            const user = getCurrentUser();
            if (!user) {
                window.location.href = 'index.html';
                return;
            }

            loadingDiv.classList.remove('hidden');
            errorDiv.classList.add('hidden');

            try {
                // refresh pantry from sessionStorage before generating
                pantry = getSessionPantry();

                const response = await fetch(`${API_BASE_URL}/generate_meal`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        family_members: user.family,
                        ingredients: pantry.ingredients,
                        mealType: pantry.mealType,
                        dayOfWeek: new Date().toLocaleString('en-us', { weekday: 'long' }),
                    }),
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || `HTTP error! Status: ${response.status}`);
                }
                const data = await response.json();
                renderRecipe(data);
            } catch (error) {
                loadingDiv.classList.add('hidden');

                // Safely set error message inside the error area. If the specific element
                // cannot be found for any reason, create one so the user sees the error.
                let errorMessageEl = null;
                try {
                    errorMessageEl = errorDiv
                        ? errorDiv.querySelector('#error-message')
                        : document.getElementById('error-message');
                } catch (e) {
                    errorMessageEl = null;
                }

                const msg = error && error.message ? error.message : String(error);
                if (errorMessageEl) {
                    errorMessageEl.textContent = msg;
                } else if (errorDiv) {
                    const p = document.createElement('p');
                    p.id = 'error-message';
                    p.className = 'text-red-500 font-mono mt-4 text-sm bg-red-50 p-3 rounded-lg';
                    p.textContent = msg;
                    errorDiv.appendChild(p);
                } else {
                    // Last resort: alert the user
                    alert('Error generating recipe: ' + msg);
                }

                // Show the error block to the user
                recipeContainer.innerHTML = '';
                if (errorDiv) recipeContainer.appendChild(errorDiv);
                if (errorDiv) errorDiv.classList.remove('hidden');

                // Wire up the retry button if present
                const retryBtn =
                    document.getElementById('regenerate-btn-error') ||
                    (errorDiv && errorDiv.querySelector('#regenerate-btn-error'));
                if (retryBtn) retryBtn.addEventListener('click', fetchAndRenderRecipe);
            }
        };

        const renderRecipe = (data) => {
            recipeContainer.innerHTML = ''; // Clear everything

            const user = getCurrentUser();
            // Safely extract fields with fallbacks to avoid undefined errors
            const meal = data && data.meal ? data.meal : { name: 'Untitled Meal', type: 'unknown', why_this_meal: '' };
            const pantryMealType = (data && data.pantry && data.pantry.mealType) || (pantry && pantry.mealType) || '';
            const totalTime =
                data && data.recipe && data.recipe.total_time_minutes ? data.recipe.total_time_minutes : 'N/A';
            const ingredientsUsed = Array.isArray(data && data.ingredients_used) ? data.ingredients_used : [];
            const steps = Array.isArray(data && data.recipe && data.recipe.steps) ? data.recipe.steps : [];
            const servingNotes = data && data.serving_notes ? data.serving_notes : '';
            const tips = Array.isArray(data && data.tips) ? data.tips : [];

            const recipeHTML = `
                <div class="bg-white rounded-2xl shadow-2xl overflow-hidden fade-in">
                    <div class="p-8 md:p-12">
                        <div class="text-center mb-8">
                            <p class="accent-orange font-semibold">${(meal.type || '').toUpperCase()} ${pantryMealType ? pantryMealType.toUpperCase() : ''}</p>
                            <h2 class="text-4xl md:text-5xl font-extrabold mt-2">${meal.name}</h2>
                            <p class="text-gray-600 mt-4 max-w-2xl mx-auto">${meal.why_this_meal || ''}</p>
                        </div>
                        
                        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 text-center my-8">
                            <div><p class="text-3xl font-bold accent-blue">${totalTime}m</p><p class="text-gray-500">Total Time</p></div>
                            <div><p class="text-3xl font-bold accent-blue">${ingredientsUsed.length}</p><p class="text-gray-500">Ingredients</p></div>
                            <div><p class="text-3xl font-bold accent-blue">${steps.length}</p><p class="text-gray-500">Steps</p></div>
                        </div>
                    </div>

                    <div class="bg-gray-50 p-8 md:p-12">
                        <div class="max-w-4xl mx-auto">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div class="space-y-8">
                                    <div>
                                        <h3 class="text-2xl font-bold mb-4">Ingredients Used</h3>
                                        <ul class="space-y-2">${ingredientsUsed.map((ing) => `<li class="flex items-center"><i class="w-5 h-5 text-green-500 mr-2 fas fa-check-circle"></i><strong>${ing.ingredient}</strong></li>`).join('')}</ul>
                                    </div>
                                </div>
                                <div class="space-y-8">
                                    <div class="collapsible-section">
                                        <button class="section-header flex justify-between items-center w-full">
                                            <h3 class="text-2xl font-bold">Instructions</h3>
                                            <i class="w-6 h-6 transform transition-transform fas fa-chevron-up"></i>
                                        </button>
                                        <div class="section-content mt-4 space-y-4">
                                            ${steps.map((step, i) => `<div class="flex"><div class="font-bold text-orange-500 mr-4">${i + 1}.</div><p>${step}</p></div>`).join('')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Serving Notes & Tips (appears after instructions on all screen sizes) -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-12 mt-8">
                                <div>
                                    ${servingNotes ? `<div class="accent-box-orange"><h3 class="text-2xl font-bold mb-4 accent-orange">Serving Notes</h3><p>${servingNotes}</p></div>` : ''}
                                </div>
                                <div>
                                    ${tips && tips.length > 0 ? `<div class="accent-box-blue"><h3 class="text-2xl font-bold mb-4 accent-blue">Chef's Tips</h3><ul class="list-disc list-inside space-y-2">${tips.map((tip) => `<li>${tip}</li>`).join('')}</ul></div>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                            <div class="p-8 text-center space-x-4">
                        <button id="regenerate-btn" class="bg-orange-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-orange-600">Regenerate Meal</button>
                    </div>
                </div>
            `;
            recipeContainer.innerHTML = recipeHTML;

            // Event Listeners
            const sectionHeader = document.querySelector('.section-header');
            if (sectionHeader) {
                sectionHeader.addEventListener('click', (e) => {
                    const header = e.currentTarget;
                    if (header.nextElementSibling) header.nextElementSibling.classList.toggle('hidden');
                    const icon = header.querySelector('i.fa-chevron-up');
                    if (icon) icon.classList.toggle('rotate-180');
                });
            }
            const regenBtn = document.getElementById('regenerate-btn');
            if (regenBtn) {
                regenBtn.addEventListener('click', (ev) => {
                    if (regenBtn.disabled) return; // ignore clicks during cooldown
                    fetchAndRenderRecipe();
                });
            }

            // Cooldown for regenerate button: disable for 75 seconds after rendering
            const startCooldown = (seconds) => {
                const btn = document.getElementById('regenerate-btn');
                if (!btn) return;
                let remaining = seconds;
                btn.disabled = true;
                btn.classList.add('regen-disabled');
                const originalText = 'Regenerate Meal';
                btn.textContent = `${originalText} (${remaining})`;
                const iv = setInterval(() => {
                    remaining -= 1;
                    if (remaining <= 0) {
                        clearInterval(iv);
                        btn.disabled = false;
                        btn.classList.remove('regen-disabled');
                        btn.textContent = originalText;
                    } else {
                        btn.textContent = `${originalText} (${remaining})`;
                    }
                }, 1000);
            };

            // Start cooldown now (user must wait before regenerating)
            startCooldown(75);
        };

        fetchAndRenderRecipe(); // Auto-run on page load
    }

    // --- PAGE INITIALIZATION ---
    // Call the appropriate init function depending on current page
    (async () => {
        // Ensure CSV is loaded before rendering dashboard
        if (page === 'dashboard.html') {
            await loadIngredientsFromCSV();
        }

        const currentPage = page || 'index.html';
        if (currentPage === '' || currentPage === 'index.html') {
            initHomePage();
        } else if (currentPage === 'family.html') {
            loadNavbar();
            initFamilyPage();
        } else if (currentPage === 'dashboard.html') {
            loadNavbar();
            initDashboardPage();
        } else if (currentPage === 'recipe.html') {
            loadNavbar();
            initRecipePage();
        }
    })();
});
