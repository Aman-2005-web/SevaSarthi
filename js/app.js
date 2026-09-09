// ── UI HELPERS & MODALS ──
let map;
let toastTimer;
let customerMarker;

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.innerHTML = '✓ ' + msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function openModal(type) {
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchModalTab(type === 'register-provider' ? 'provider' : 'consumer');
}

function closeModal() { 
  document.getElementById('modal').classList.remove('open'); 
  document.body.style.overflow = ''; 
}

function closeModalIfOverlay(e) { 
  if (e.target === document.getElementById('modal')) closeModal(); 
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.modal-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('modal-tab-' + tab).classList.add('active');
  document.getElementById('modal-' + tab).classList.add('active');
  backToPhone(); 
  backToProviderPhone();
}

function backToPhone() { 
  document.getElementById('consumer-input-fields').style.display = 'block'; 
  document.getElementById('consumer-otp-fields').style.display = 'none'; 
}

function backToProviderPhone() { 
  document.getElementById('provider-input-fields').style.display = 'block'; 
  document.getElementById('provider-otp-fields').style.display = 'none'; 
}

let currentAuthMode = 'login';

function toggleAuthIntent(mode) {
  currentAuthMode = mode;
  backToPhone();
  const title = document.getElementById('modal-title'); 
  const sub = document.getElementById('modal-sub');
  const btn = document.getElementById('primary-auth-btn'); 
  const nameRow = document.getElementById('name-row');
  const toggleTxt = document.getElementById('auth-toggle-text');
  if (mode === 'register') {
    title.textContent = 'Create Account'; sub.textContent = 'Join thousands finding services daily';
    btn.textContent = 'Send Verification OTP'; nameRow.style.display = 'grid';
    toggleTxt.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthIntent(\'login\');return false;" style="color:var(--accent); text-decoration:none; font-weight:600;">Sign in</a>';
  } else {
    title.textContent = 'Welcome back'; sub.textContent = 'Sign in to your account';
    btn.textContent = 'Send Login OTP'; nameRow.style.display = 'none';
    toggleTxt.innerHTML = 'New to SevaSarthi? <a href="#" onclick="toggleAuthIntent(\'register\');return false;" style="color:var(--accent); text-decoration:none; font-weight:600;">Create account</a>';
  }
}

function toggleProviderAuthIntent(mode) {
  currentAuthMode = mode;
  backToProviderPhone();
  const nameRow = document.getElementById('provider-name-row'); 
  const btn = document.getElementById('provider-auth-btn');
  const toggleTxt = document.getElementById('provider-auth-toggle-text');
  if (mode === 'register') {
    nameRow.style.display = 'grid'; btn.textContent = 'Send Registration OTP';
    toggleTxt.innerHTML = 'Already a provider? <a href="#" onclick="toggleProviderAuthIntent(\'login\');return false;" style="color:var(--accent); text-decoration:none; font-weight:600;">Sign in</a>';
  } else {
    nameRow.style.display = 'none'; btn.textContent = 'Send Login OTP';
    toggleTxt.innerHTML = 'New provider? <a href="#" onclick="toggleProviderAuthIntent(\'register\');return false;" style="color:var(--accent); text-decoration:none; font-weight:600;">Create provider account</a>';
  }
}

function otpAutoTab(input) {
  input.value = input.value.replace(/\D/g, '');
  if (input.value.length === 1) {
    const all = Array.from(document.querySelectorAll('.otp-field'));
    const idx = all.indexOf(input);
    if (idx < all.length - 1) all[idx + 1].focus();
  }
}

document.addEventListener("DOMContentLoaded", function() {
  const mapElement = document.getElementById('map');
  if (mapElement) {
    map = L.map('map', { zoomControl: false }).setView([23.7957, 86.4304], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    setTimeout(() => { if(map) map.invalidateSize(); }, 400);
  }
});

// ── SUPABASE CLIENT & CORE LOGIC ──
const SUPABASE_URL = "https://fekvrxxhspbntjriwiha.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YrjBg24OxoW--XxfI71EBg_nCqm3lMo";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentAuthMode = 'login';
window.customerLat = null;
window.customerLng = null;
window.currentMapMarkers = [];

if (typeof window.showToast !== 'function') {
  window.showToast = function(msg) {
    const toast = document.getElementById('toast');
    if(toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  };
}

if (typeof window.closeModal !== 'function') {
  window.closeModal = function() {
    const modals = document.querySelectorAll('.modal-overlay, .modal');
    modals.forEach(m => m.classList.remove('open', 'active'));
    document.body.style.overflow = 'auto';
  };
}

// ── AUTH OBSERVER & ROLE SWITCHER ──
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  const status = document.getElementById("user-status");
  const signin = document.getElementById("signin-btn");
  const register = document.getElementById("register-btn");
  const signout = document.getElementById("signout-btn");

  if (session && session.user) {
    const pendingRole = localStorage.getItem('pending_role');
    const pendingPhone = localStorage.getItem('pending_phone');
    const pendingName = ((localStorage.getItem('temp_firstname') || '') + " " + (localStorage.getItem('temp_lastname') || '')).trim();

    if (pendingRole || pendingPhone || pendingName) {
      await supabaseClient.auth.updateUser({
        data: { 
          role: pendingRole || session.user.user_metadata?.role || 'customer', 
          saved_phone: pendingPhone || '',
          full_name: pendingName || session.user.user_metadata?.full_name || ''
        }
      });
    }

    const userId = session.user.id;
    const { data: existingProfile } = await supabaseClient.from('profiles').select('role, full_name, mobile').eq('id', userId).single();

    const rawRole = existingProfile?.role || pendingRole || session.user.user_metadata?.role || 'customer';
    const finalRole = rawRole.toLowerCase();
    const userPhone = pendingPhone || session.user.user_metadata?.saved_phone || session.user.phone || existingProfile?.mobile || '';
    const userName = pendingName || existingProfile?.full_name || session.user.user_metadata?.full_name || 'User';
    const userEmail = session.user.email || ''; 

    localStorage.removeItem('pending_role'); 
    localStorage.removeItem('pending_phone');
    localStorage.removeItem('temp_firstname'); 
    localStorage.removeItem('temp_lastname');
   
    await supabaseClient.from('profiles').upsert([{ 
        id: userId, full_name: userName, mobile: userPhone, role: finalRole, email: userEmail
    }]);

    const identity = userName !== 'User' ? userName : (userPhone || "Logged In");
    if(status) {
      status.style.display = "inline-block";
      status.textContent = finalRole === "provider" ? `${identity} (Provider)` : identity;
    }
    if(signin) signin.style.display = "none"; 
    if(register) register.style.display = "none"; 
    if(signout) signout.style.display = "inline-flex";
    
    if (finalRole === "provider") {
      document.body.classList.add('provider-mode');
      if(window.loadProviderDashboard) window.loadProviderDashboard();
    } else {
      document.body.classList.remove('provider-mode');
      if(window.loadLiveProvidersOnMap) window.loadLiveProvidersOnMap(window.customerLat, window.customerLng, "");
    }
    window.closeModal();
  } else {
    if(status) status.style.display = "none"; 
    if(signin) signin.style.display = "inline-flex"; 
    if(register) register.style.display = "inline-flex"; 
    if(signout) signout.style.display = "none";
    document.body.classList.remove('provider-mode');
    if(window.loadLiveProvidersOnMap) window.loadLiveProvidersOnMap(); 
  }
});

// ── GOOGLE AUTH & OTP ──
window.initiateGoogleAuth = async function (role = 'customer') {
  try {
    localStorage.setItem('pending_role', role);
    const mode = window.currentAuthMode || 'login';
    if (mode === 'register' && role === 'provider') {
      const mobileInput = document.getElementById('provider-mobile');
      const mobileValue = mobileInput ? mobileInput.value.replace(/\D/g, '') : '';
      if (mobileValue && /^[6-9]\d{9}$/.test(mobileValue)) {
        localStorage.setItem('pending_phone', '+91' + mobileValue);
      } else {
        window.showToast("Enter a valid 10-digit mobile number to register."); return; 
      }
    }
    window.showToast("Opening Google...");
    await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } });
  } catch(e) {
    console.error(e);
  }
};

window.triggerSupabaseOTP = async function (role = 'customer') {
  const inputId = role === 'provider' ? 'provider-mobile' : 'auth-mobile';
  const displayId = role === 'provider' ? 'provider-otp-phone-display' : 'otp-phone-display';
  const inputEl = document.getElementById(inputId);
  if(!inputEl) return;
  
  const raw = inputEl.value.trim().replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(raw)) { window.showToast("Enter a valid 10-digit Indian number."); return; }
  const phoneWithCode = '+91' + raw;

  const { data: existingProfile } = await supabaseClient.from('profiles').select('id').eq('mobile', phoneWithCode).single();
  const mode = window.currentAuthMode || 'login';
  
  if (mode === 'register' && existingProfile) { window.showToast("❌ Account already exists! Please sign in."); return; }
  if (mode === 'login' && !existingProfile) { window.showToast("❌ No account found! Please create an account first."); return; }

  const fName = document.getElementById(role === 'provider' ? 'provider-firstname' : 'auth-firstname'); 
  const lName = document.getElementById(role === 'provider' ? 'provider-lastname' : 'auth-lastname');
  if(fName && fName.value) localStorage.setItem('temp_firstname', fName.value);
  if(lName && lName.value) localStorage.setItem('temp_lastname', lName.value);
  localStorage.setItem('pending_role', role);

  window._globalCurrentAuthPhone = phoneWithCode; 
  const dispEl = document.getElementById(displayId); if(dispEl) dispEl.textContent = window._globalCurrentAuthPhone;
  
  window.showToast("Requesting OTP...");
  const { error } = await supabaseClient.auth.signInWithOtp({ phone: window._globalCurrentAuthPhone });
  
  if (error) { window.showToast("Error: " + error.message); } 
  else {
    if(document.getElementById(role === 'provider' ? 'provider-input-fields' : 'consumer-input-fields')) document.getElementById(role === 'provider' ? 'provider-input-fields' : 'consumer-input-fields').style.display = 'none';
    if(document.getElementById(role === 'provider' ? 'provider-otp-fields' : 'consumer-otp-fields')) document.getElementById(role === 'provider' ? 'provider-otp-fields' : 'consumer-otp-fields').style.display = 'block';
    window.showToast("OTP sent successfully!");
  }
};

window.verifySupabaseOTP = async function (role = 'customer') {
  if (!window._globalCurrentAuthPhone) return;
  let code = role === 'provider' ? document.getElementById('provider-otp-code').value.trim() : Array.from(document.querySelectorAll('.otp-field')).map(i => i.value.trim()).join('');
  if (code.length < 6) { window.showToast("Enter all 6 digits."); return; }
  
  window.showToast("Verifying...");
  const { error } = await supabaseClient.auth.verifyOtp({ phone: window._globalCurrentAuthPhone, token: code, type: 'sms' });
  
  if (error) { window.showToast("Invalid OTP."); } 
  else {
    window.showToast("Verified!"); window.closeModal(); setTimeout(() => { window.location.reload(); }, 1200);
  }
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

window.askCustomerLocation = function() {
  if (navigator.geolocation) {
    const locText = document.getElementById('location-text');
    if(locText) locText.textContent = "Finding...";

    navigator.geolocation.getCurrentPosition(async (pos) => {
      window.customerLat = pos.coords.latitude; window.customerLng = pos.coords.longitude;
      
      if(typeof map !== 'undefined' && map) {
        map.setView([window.customerLat, window.customerLng], 13); 
        if(window.customerMarker) { map.removeLayer(window.customerMarker); }
        if(typeof L !== 'undefined') window.customerMarker = L.marker([window.customerLat, window.customerLng], {zIndexOffset: 1000}).addTo(map).bindPopup("<b>📍 You are here</b>").openPopup();
      }
      window.showToast("Location detected automatically!");
      window.loadLiveProvidersOnMap(window.customerLat, window.customerLng, document.getElementById('search-input') ? document.getElementById('search-input').value : "");

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${window.customerLat}&lon=${window.customerLng}`);
        const data = await res.json();
        if(locText) locText.textContent = data.address.suburb || data.address.neighbourhood || data.address.town || data.address.city || "Location Found";
      } catch (err) { if(locText) locText.textContent = "Location Found"; }
    }, (err) => {
      window.showToast("Please allow location access to see nearby providers.");
      if(document.getElementById('location-text')) document.getElementById('location-text').textContent = "Find Location";
      window.loadLiveProvidersOnMap(null, null, "");
    });
  } else { window.showToast("Geolocation is not supported by your browser."); }
}; 

window.searchProviders = function(quickTagValue) {
  const searchInput = document.getElementById('search-input');
  const searchTerm = quickTagValue || (searchInput ? searchInput.value.trim() : "");
  if (quickTagValue && searchInput) searchInput.value = quickTagValue;
  if (window.loadLiveProvidersOnMap) window.loadLiveProvidersOnMap(window.customerLat || null, window.customerLng || null, searchTerm);
};

window.loadLiveProvidersOnMap = async function(customerLat = null, customerLng = null, searchTerm = "") {
  const listContainer = document.getElementById('customer-provider-list');
  if(!listContainer) return;

  let dbQuery = supabaseClient.from('profiles').select('*').ilike('role', '%provider%');
  if (searchTerm && searchTerm.trim() !== "") dbQuery = dbQuery.ilike('service_category', `%${searchTerm.trim()}%`);

  const { data: providers, error } = await dbQuery;
  if (error) { listContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--accent);">Error loading providers. Please refresh!</div>`; return; }

  listContainer.innerHTML = ''; let foundNearby = false;

  if (window.currentMapMarkers && window.currentMapMarkers.length > 0) {
    window.currentMapMarkers.forEach(m => { if(typeof map !== 'undefined' && map) map.removeLayer(m); });
  }
  window.currentMapMarkers = [];

  if (providers && providers.length > 0) {
    providers.forEach(p => {
      let dist = null;
      if (p.latitude && p.longitude && customerLat && customerLng) {
        dist = calculateDistance(customerLat, customerLng, parseFloat(p.latitude), parseFloat(p.longitude));
      }

      if (!customerLat || (dist !== null && dist <= 10)) { 
        foundNearby = true;
        if(typeof map !== 'undefined' && map && typeof L !== 'undefined' && p.latitude && p.longitude) {
          const marker = L.marker([parseFloat(p.latitude), parseFloat(p.longitude)]).addTo(map);
          window.currentMapMarkers.push(marker);
          
          marker.bindPopup(`
            <div style="text-align:center; min-width: 140px;">
              <b style="font-size: 15px;">${p.full_name || 'Verified Provider'}</b><br>
              <span style="color:var(--text2); font-size:13px;">${p.service_category || 'Service'}</span><br>
              <span style="font-size:12px; color: var(--green); font-weight:600;">📍 ${dist !== null ? dist.toFixed(1) + ' km away' : 'Available'}</span><br>
              <button class="btn btn-primary" style="margin-top:10px; width:100%; justify-content:center; padding: 6px 10px; font-size: 13px;" onclick="event.stopPropagation(); window.openBookingModal('${p.full_name || 'Provider'}', '${p.mobile}', '${p.id}')">Book Now</button>
            </div>
          `);
        }

        const item = document.createElement('div');
        item.className = 'map-provider-item'; item.style.alignItems = 'center';
        item.onclick = () => { if(typeof map !== 'undefined' && map && p.latitude && p.longitude) map.setView([parseFloat(p.latitude), parseFloat(p.longitude)], 15); };
        
        item.innerHTML = `
          <div class="mpi-avatar" style="background:var(--accent);">${(p.full_name||'P').substring(0,2).toUpperCase()}</div>
          <div class="mpi-info">
            <div class="mpi-name">${p.full_name || 'Verified Provider'}</div>
            <div class="mpi-role">${p.service_category || 'Service Professional'}</div>
            <div style="font-size: 11px; color: var(--green); margin-top:2px;">📍 ${dist !== null ? dist.toFixed(1) + ' km away' : 'Verified Partner'}</div>
          </div>
          <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; border-color: var(--accent); color: var(--accent);" onclick="event.stopPropagation(); window.openBookingModal('${p.full_name || 'Provider'}', '${p.mobile}', '${p.id}')">Book</button>
        `;
        listContainer.appendChild(item);
      }
    });
  }

  if (!foundNearby) {
    listContainer.innerHTML = `
      <div style="padding: 30px 20px; text-align: center; color: var(--text3); font-size: 14px;">
        <div style="font-size: 38px; margin-bottom: 10px;">🚫</div>
        <b>No ${searchTerm ? `'${searchTerm}'` : 'providers'} found near you!</b><br>
        <span style="font-size: 12px; color: var(--text2); display: block; margin-top: 6px;">
          ${customerLat ? 'No provider is currently registered within 10 km for this category.' : 'Try clicking "Locate Me" or search another service.'}
        </span>
      </div>`;
  }
};

// ── PROVIDER DASHBOARD ENGINE ──
window.loadProviderDashboard = async function() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session) return;
  const providerId = session.user.id;

  const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', providerId).single();
  if(profile) {
    if(document.getElementById('prov-name')) document.getElementById('prov-name').value = profile.full_name || '';
    if(document.getElementById('prov-gender')) document.getElementById('prov-gender').value = profile.gender || '';
    if(profile.service_category && document.getElementById('prov-cat')) document.getElementById('prov-cat').value = profile.service_category;
    if(profile.experience && document.getElementById('prov-exp')) document.getElementById('prov-exp').value = profile.experience;
    
    if(profile.service_category) {
      if(document.getElementById('view-name')) document.getElementById('view-name').textContent = profile.full_name || 'N/A';
      if(document.getElementById('view-gender')) document.getElementById('view-gender').textContent = profile.gender || 'N/A';
      if(document.getElementById('view-cat')) document.getElementById('view-cat').textContent = profile.service_category;
      if(document.getElementById('view-exp')) document.getElementById('view-exp').textContent = profile.experience ? profile.experience + " Years" : "N/A";
      
      if(document.getElementById('prov-edit-mode')) document.getElementById('prov-edit-mode').style.display = 'none';
      if(document.getElementById('prov-view-mode')) document.getElementById('prov-view-mode').style.display = 'block';
      if(document.getElementById('save-prov-btn')) document.getElementById('save-prov-btn').style.display = 'none';
      if(document.getElementById('edit-prov-btn')) document.getElementById('edit-prov-btn').style.display = 'flex';
    }
  }

  const requestsListArea = document.getElementById('live-requests-list');
  const emptyState = document.getElementById('provider-empty-state');
  if (requestsListArea && providerId) {
    const { data: requests } = await supabaseClient.from('bookings').select('*').eq('provider_id', providerId).order('created_at', { ascending: false });
    
    if (requests && requests.length > 0) {
      if (emptyState) emptyState.style.display = 'none';
      requestsListArea.innerHTML = '';

      requests.forEach(r => {
        const reqCard = document.createElement('div');
        reqCard.style = "background: var(--surface); border: 1px solid var(--border); padding: 14px 18px; border-radius: var(--radius-sm); box-shadow: var(--shadow); display: flex; justify-content: space-between; align-items: center; width: 100%;";
        
        let scheduleDetails = (r.apt_date || r.appointment_date) 
          ? `<div style="margin-top: 6px; display:inline-block; background: #eff6ff; color: #1e40af; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;">📅 ${r.apt_date || r.appointment_date} btw ${r.apt_from || 'N/A'} to ${r.apt_to || 'N/A'}</div>`
          : `<div style="font-size: 13px; color: var(--accent); margin: 4px 0; font-weight: 600;">💬 ${r.message || 'New Request'}</div>`;

        reqCard.innerHTML = `
          <div style="flex: 1; padding-right: 15px;">
            <div style="font-weight: 700; font-size: 16px; color: var(--text);">${r.customer_name || 'Verified Customer'}</div>
            ${scheduleDetails}
            <div style="font-size: 11px; color: var(--text3); margin-top: 6px;">Requested: ${new Date(r.created_at).toLocaleDateString('en-IN')}</div>
          </div>
          <a href="tel:${r.customer_mobile}" class="btn btn-primary" style="padding: 10px 16px; font-size: 13px; border-radius:8px; text-decoration:none;">📞 Call Now</a>
        `;
        requestsListArea.appendChild(reqCard);
      });
    } else {
      if (emptyState) emptyState.style.display = 'block';
      requestsListArea.innerHTML = '';
    }
  }
};

window.enableEditMode = function() {
  if(document.getElementById('prov-view-mode')) document.getElementById('prov-view-mode').style.display = 'none';
  if(document.getElementById('prov-edit-mode')) document.getElementById('prov-edit-mode').style.display = 'block';
  if(document.getElementById('edit-prov-btn')) document.getElementById('edit-prov-btn').style.display = 'none';
  if(document.getElementById('save-prov-btn')) { document.getElementById('save-prov-btn').style.display = 'flex'; document.getElementById('save-prov-btn').textContent = "Update Details & Relock 📍"; }
};

window.saveProviderProfile = async function() {
  const name = document.getElementById('prov-name').value.trim();
  const gender = document.getElementById('prov-gender').value;
  const exp = document.getElementById('prov-exp').value;
  const cat = document.getElementById('prov-cat').value.trim();
  
  if(!name || !cat) { window.showToast("Name and Category are required!"); return; }
  const btn = document.getElementById('save-prov-btn'); if(btn) btn.textContent = "Updating Profile & Locking... ⏳";

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if(session) {
        const { error } = await supabaseClient.from('profiles').update({
          full_name: name, gender: gender, experience: exp, service_category: cat, latitude: pos.coords.latitude, longitude: pos.coords.longitude
        }).eq('id', session.user.id);
        
        if(error) window.showToast("Error saving data: " + error.message);
        else { window.showToast("Profile Saved & Live Location Locked! 📍"); window.loadProviderDashboard(); }
      }
      if(btn) btn.textContent = "Save Details & Lock Location 📍";
    }, () => { window.showToast("Location denied! Cannot list you on map."); if(btn) btn.textContent = "Save Details & Lock Location 📍"; });
  } else { window.showToast("Geolocation not supported."); if(btn) btn.textContent = "Save Details & Lock Location 📍"; }
};

// ── BOOKING SYSTEM ──
window.currentBookingPhone = ""; window.currentProviderId = "";

window.openBookingModal = async function(name, phone, providerId) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { alert("Please sign in to schedule an appointment."); if(window.openModal) window.openModal('consumer'); return; }

  if(document.getElementById('book-prov-name')) document.getElementById('book-prov-name').textContent = name;
  window.currentBookingPhone = phone; window.currentProviderId = providerId; 
  
  if(document.getElementById('appointment-date')) document.getElementById('appointment-date').value = new Date().toISOString().split('T')[0];
  if(document.getElementById('appointment-from')) document.getElementById('appointment-from').value = "10:00";
  if(document.getElementById('appointment-to')) document.getElementById('appointment-to').value = "11:00";
  if(document.getElementById('direct-call-btn')) document.getElementById('direct-call-btn').setAttribute('href', `tel:${phone}`);
  if(document.getElementById('booking-modal')) document.getElementById('booking-modal').classList.add('open');
};

window.submitCustomAppointment = async function() {
  const dateVal = document.getElementById('appointment-date').value;
  const fromVal = document.getElementById('appointment-from').value;
  const toVal = document.getElementById('appointment-to').value;

  if(!dateVal || !fromVal || !toVal) { alert("Please select Date and full Time slot!"); return; }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if(!session || !window.currentProviderId) return;

    const { data: customerProfile } = await supabaseClient.from('profiles').select('full_name, mobile').eq('id', session.user.id).single();
    const { error } = await supabaseClient.from('bookings').insert([{
      provider_id: window.currentProviderId, customer_name: customerProfile?.full_name || "Verified Customer", customer_mobile: customerProfile?.mobile || "N/A",
      message: `Requested Custom Scheduled Slot`, apt_date: dateVal, apt_from: fromVal, apt_to: toVal
    }]);

    if(!error) {
      alert(`🎉 Appointment submitted for ${dateVal} between ${fromVal} to ${toVal}!`);
      if(document.getElementById('booking-modal')) document.getElementById('booking-modal').classList.remove('open');
    } else { console.error(error); }
  } catch (err) { console.error("Scheduling failed:", err); }
};

window.sendWhatsAppMsg = async function(message) {
  if(!window.currentBookingPhone) return;
  let phone = window.currentBookingPhone.replace(/\D/g, ''); if(phone.length === 10) phone = '91' + phone;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
};

// ── LOGOUT ──
window.signOutUser = async function () { 
  await supabaseClient.auth.signOut(); 
  localStorage.clear();
  alert("Signed out."); 
  window.location.reload();
};
