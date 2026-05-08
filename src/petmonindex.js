/*
 * Copyright (c) 2026 (주)리한 (ReHAN Co. LTD.)
 * All rights reserved.
 *
 * 이 소프트웨어와 관련 문서의 저작권은 (주)리한에 있으며,
 * 저작권자의 서면 동의 없이 무단으로 복제, 배포, 수정, 전송할 수 없습니다.
 *
 * This software is the confidential and proprietary information of [ReHAN Co. LTD.].
 * You shall not disclose such Confidential Information and shall use it only in
 * accordance with the terms of the license agreement you entered into with [ReHAN Co. LTD.].
 */

//
// ========== 호스팅 땐 console.log 주석 처리나 제거 ==========
const loginButton = document.getElementById('login-button');
const loginPopup = document.getElementById('login-popup');
const loginSubmit = document.getElementById('login-submit');
const phoneNumberInput = document.getElementById('phone-number');
const processMessage = document.getElementById('process-message');
const stopButton = document.getElementById('stop-button');
const returnHomeButton = document.getElementById('return-home');
const keypad = document.querySelector('.keypad');
const addMoreButton = document.getElementById('add-more-button');
const mainScreen = document.getElementById('main-screen');
const processScreen = document.getElementById('process-screen');
const endScreen = document.getElementById('end-screen');
const errorScreen = document.getElementById('error-screen');
const jamScreen = document.getElementById('jam-screen');
const statusHostMain = document.getElementById('status-host-main');
const statusHostProcess = document.getElementById('status-host-process');
const statusSection = document.getElementById('status-section');
const branchNameSpan = document.getElementById('branch-name');

const closeDoorButton = document.createElement('button');
closeDoorButton.id = 'close-door-button';
closeDoorButton.textContent = '닫기';
// 스타일 프리셋
const CLOSE_BTN_ACTIVE_STYLE =
    'margin-top:24px;font-size:1.5rem;padding:12px 32px;background:#3772ff;color:#fff;border:none;border-radius:8px;cursor:pointer;display:block;';
const CLOSE_BTN_DISABLED_STYLE =
    'margin-top:24px;font-size:1.5rem;padding:12px 32px;background:#94a3b8;color:#e5e7eb;border:none;border-radius:8px;cursor:not-allowed;display:block;opacity:0.8;';
closeDoorButton.style = CLOSE_BTN_ACTIVE_STYLE;
// 닫기 버튼 카운트다운(3초 후 활성화) 타이머 상태
let __closeBtnUnlockTimer = null;
let __closeBtnCountdown = 0;

let port, reader, writer;
let isConnected = false;
// 수신 버퍼 설정
let __rxBuf = '';

let __handDetectSuppressUntil = 0;

let isStopped = false;
let autoReturnTimeout;
let countdownInterval;
let errorAutoTimer;
let errorCountdownTimer;
// 테스트 모드 상태
let __testMode = false;
// 에러 스크린 1회 플래그
let __errorShownOnce = false;

// 세션용 유틸/상수
const MEMBER_API_URL = 'https://petcycle.mycafe24.com/member_api.php';
const POINT_API_URL = 'https://petcycle.mycafe24.com/point_api.php';

/** 테스트 모드 표시 */
function updateTestBadge() {
    const b = document.getElementById('test-mode-badge');
    if (!b) return;
    if (__testMode) {
        b.textContent = '테스트모드: ON';
        b.style.color = '#86efac';
    } else {
        b.textContent = '테스트모드: OFF';
        b.style.color = '#fca5a5';
    }
}
/** UUID v4 생성 (member/point API용 unique key). group_cd를 prefix로 붙임 */
function secureUuid(prefix = '') {
    try {
        if (window.crypto && typeof crypto.randomUUID === 'function') {
            return prefix + crypto.randomUUID();
        }
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        buf[6] = (buf[6] & 0x0f) | 0x40;
        buf[8] = (buf[8] & 0x3f) | 0x80;
        const hex = Array.from(buf)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        const uuid = `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(
            20,
            12,
        )}`;
        return prefix + uuid;
    } catch {
        const rnd = Math.random().toString(36).slice(2);
        return prefix + Date.now() + '-' + rnd;
    }
}
function newClientUniqueId() {
    const g = (deviceConfig?.groupCode || 'etc') + '-';
    return secureUuid(g);
}
function getGroupCode() {
    return deviceConfig?.groupCode || localStorage.getItem('petmon.group_cd') || 'etc';
}

// 모달 생성 및 표시
/** title='', line=[], yesText='', noText='', onYes, onNo */
function showConfirmModal({ title = '확인', lines = [], yesText = '예', noText = '아니오', onYes, onNo }) {
    let overlay = document.getElementById('confirm-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-modal-overlay';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'background:rgba(0,0,0,.7)', // 어두운 오버레이
            'backdrop-filter:blur(2px)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'z-index:9999',
        ].join(';');

        const modal = document.createElement('div');
        modal.id = 'confirm-modal';
        modal.style.cssText = [
            'width:560px',
            'max-width:95vw',
            'background:#0f172a',
            'border-radius:14px',
            'overflow:hidden',
            'box-shadow:0 20px 50px rgba(0,0,0,.45)',
            'border:1px solid #1e293b',
            'font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
            'color:#cbd5e1',
        ].join(';');

        modal.innerHTML = `
          <div id="cm-title" style="
              padding:16px 22px;
              font-size:18px;
              font-weight:800;
              color:#e5e7eb;            
              background:#111827;          
              border-bottom:1px solid #1e293b;
          ">제목</div>

          <div id="cm-body" style="
              padding:18px 22px;
              color:#cbd5e1;            
              font-size:22px;
              line-height:1.7;
              background:#0f172a;          
          "></div>

          <div style="
              display:flex;
              gap:10px;
              justify-content:flex-end;
              padding:14px 18px;
              background:#0b1220;          
              border-top:1px solid #1e293b;
          ">
            <button id="cm-no" style="
                padding:10px 16px;
                border-radius:10px;
                border:1px solid #334155;  
                background:#0f172a;        
                color:#cbd5e1;
                cursor:pointer;
                font-weight:600;
                outline:none;
                width: 100px;
            ">아니오</button>

            <button id="cm-yes" style="
                padding:10px 16px;
                border-radius:10px;
                border:1px solid #3772ff;
                background:#3772ff;        
                color:#ffffff;
                cursor:pointer;
                font-weight:700;
                outline:none;
                width: 100px;
            ">예</button>
          </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 간단한 포커스 효과
        const yesBtnTemp = modal.querySelector('#cm-yes');
        const noBtnTemp = modal.querySelector('#cm-no');
        const addFocusRing = (el, color) => {
            el.addEventListener('focus', () => (el.style.boxShadow = `0 0 0 2px ${color}55`));
            el.addEventListener('blur', () => (el.style.boxShadow = 'none'));
            el.addEventListener('mouseenter', () => (el.style.filter = 'brightness(1.05)'));
            el.addEventListener('mouseleave', () => (el.style.filter = 'none'));
        };
        addFocusRing(yesBtnTemp, '#3772ff');
        addFocusRing(noBtnTemp, '#94a3b8');
    }

    const titleEl = overlay.querySelector('#cm-title');
    const bodyEl = overlay.querySelector('#cm-body');
    const yesBtn = overlay.querySelector('#cm-yes');
    const noBtn = overlay.querySelector('#cm-no');

    titleEl.textContent = title;
    bodyEl.innerHTML = lines.map((l) => `<div style="margin:6px 0;">${l}</div>`).join('');
    yesBtn.textContent = yesText || '예';
    noBtn.textContent = noText || '아니오';

    const close = () => {
        overlay.style.display = 'none';
        yesBtn.onclick = null;
        noBtn.onclick = null;
        document.removeEventListener('keydown', onKey);
        overlay.removeEventListener('click', onOverlayClick);
    };
    yesBtn.onclick = () => {
        try {
            onYes && onYes();
        } finally {
            close();
        }
    };
    noBtn.onclick = () => {
        try {
            onNo && onNo();
        } finally {
            close();
        }
    };

    // ESC랑 Enter 키 처리
    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            noBtn.click();
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            yesBtn.click();
        }
    };
    const onOverlayClick = (e) => {
        if (e.target && e.target.id === 'confirm-modal-overlay') {
            noBtn.click();
        }
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onOverlayClick);

    overlay.style.display = 'flex';
}

// 장치 연결 끊김 시 처리
async function teardownSerial() {
    try {
        if (reader) {
            try {
                await reader.cancel?.();
            } catch {}
            try {
                reader.releaseLock?.();
            } catch {}
        }
        if (writer) {
            try {
                writer.releaseLock?.();
            } catch {}
        }
        if (port) {
            try {
                await port.close();
            } catch {}
        }
    } finally {
        port = undefined;
        reader = undefined;
        writer = undefined;
        isConnected = false;
        // 버퍼 초기화
        __rxBuf = '';
    }
}

function handleDeviceLost(err) {
    const msg = String((err && (err.message || err)) || '').toLowerCase();
    const lost = msg.includes('device has been lost');
    const networkErr = err && err.name === 'NetworkError';
    if (lost || networkErr) {
        // 연결 끊김 및 사용자 안내
        teardownSerial();
        showErrorScreen('기기와의 연결이 끊어졌습니다.\n관리자에게 문의 바랍니다. 1644-1224');
        return true;
    }
    return false;
}

// 시리얼 줄 단위 명령 처리 -> 항상 \n 포함
function writeCmd(cmd) {
    if (__testMode) {
        // 시뮬레이터 writer에 위임
        return writer && writer.write ? writer.write(cmd + '\n') : Promise.resolve();
    }
    if (!writer) return Promise.resolve();
    try {
        return writer.write(cmd + '\n');
    } catch (e) {
        console.error('writeCmd 실패:', cmd, e);
        return Promise.reject(e);
    }
}

// ACK 체크
async function writeCmdWithAck(cmd, timeoutMs = 3000) {
    await writeCmd(cmd);
    try {
        // ACK:CMD 또는 NACK:CMD:... 형태 응답 메세지
        // 소문자로 정규화해서 비교하므로 ack:cmd 대기
        const ackStr = 'ack:' + cmd;
        a;
        await waitForArduinoResponse(ackStr, { timeoutMs, silent: true });
    } catch (e) {
        console.warn(`ACK Timeout/Fail for command: ${cmd}`, e);
        // NACK 수신 여부 확인 등 추가 로직 구현 예정
        // 2025-01-15: 단순 타임아웃으로 처리
        throw new Error(`Command ${cmd} failed (No ACK)`);
    }
}

let currentPhoneNumber = '';
let deviceConfig = { deviceCode: undefined, branchName: undefined };

// USB 장치 필터링
const PREFERRED_USB_DEVICES = [
    { vid: 0x067b, pid: 0x2303, label: 'Prolific PL2303 (USB-Serial Controller)' }, // main target
    { vid: 0x1a86, pid: 0x7523, label: 'CH340/CH341' },
    { vid: 0x0403, pid: 0x6001, label: 'FTDI FT232R' },
    { vid: 0x10c4, pid: 0xea60, label: 'Silicon Labs CP210x' },
];

function getPreferredFilters() {
    try {
        const sv = Number(localStorage.getItem('petmon.usb.vid'));
        const sp = Number(localStorage.getItem('petmon.usb.pid'));
        const filters = [];
        if (sv && sp) filters.push({ usbVendorId: sv, usbProductId: sp });
        else PREFERRED_USB_DEVICES.forEach((d) => filters.push({ usbVendorId: d.vid, usbProductId: d.pid }));
        return filters;
    } catch {
        return [];
    }
}

function matchesPreferred(port) {
    try {
        const info = port.getInfo?.() || {};
        const v = info.usbVendorId;
        const p = info.usbProductId;
        if (!v || !p) return false;
        const sv = Number(localStorage.getItem('petmon.usb.vid'));
        const sp = Number(localStorage.getItem('petmon.usb.pid'));
        if (sv && sp) return v === sv && p === sp;
        return PREFERRED_USB_DEVICES.some((d) => d.vid === v && d.pid === p);
    } catch {
        return false;
    }
}

function rememberPreferred(port) {
    try {
        const info = port.getInfo?.() || {};
        if (info.usbVendorId && info.usbProductId) {
            localStorage.setItem('petmon.usb.vid', String(info.usbVendorId));
            localStorage.setItem('petmon.usb.pid', String(info.usbProductId));
        }
    } catch {}
}

// ====== ini 파일(C:\\petmon.ini)에서 지점명/기기코드 읽기 ======
//  1) /petmon.ini (서비스 루트)
//  2) /config/petmon.ini (서브 경로 예시)
// INI 포맷 예시:
//   device=SW0000
//   branch=연구소
//   group_cd=suwon
async function loadDeviceConfig() {
    // 1) localStorage 저장값 사용
    try {
        const lsBranch = localStorage.getItem('petmon.branch');
        const lsDevice = localStorage.getItem('petmon.device');
        const lsGroup = localStorage.getItem('petmon.group_cd');
        if (lsBranch || lsDevice || lsGroup) {
            deviceConfig = {
                deviceCode: lsDevice || deviceConfig.deviceCode,
                branchName: lsBranch || deviceConfig.branchName,
                groupCode: lsGroup || deviceConfig.groupCode,
            };
            if (deviceConfig.branchName && branchNameSpan) branchNameSpan.textContent = deviceConfig.branchName;
            return;
        }
    } catch {}
    // // 2) window.PETMON_CONFIG 사용
    // try {
    //     if (window && window.PETMON_CONFIG) {
    //         const cfg = window.PETMON_CONFIG || {};
    //         deviceConfig = {
    //             deviceCode: cfg.deviceCode,
    //             branchName: cfg.branchName,
    //             groupCode: cfg.groupCode,
    //         };
    //         if (deviceConfig.branchName && branchNameSpan) {
    //             branchNameSpan.textContent = deviceConfig.branchName;
    //             return;
    //         }
    //     }
    // } catch {}
    // 3) ini 파일 시도
    const candidates = ['/petmon.ini', '/config/petmon.ini'];
    for (const url of candidates) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) continue;
            const text = await res.text();
            const lines = text.split(/\r?\n/);
            const out = { deviceCode: undefined, branchName: undefined, groupCode: undefined };
            for (const raw of lines) {
                const line = raw.trim();
                if (!line || line.startsWith('#') || line.startsWith(';')) continue;
                const m = line.match(/^([^=:#]+)\s*[:=]\s*(.*)$/);
                if (!m) continue;
                const key = m[1].trim().toLowerCase();
                const val = m[2].trim();
                if (key === 'device' || key === 'devicecode' || key === 'code') out.deviceCode = val;
                if (key === 'branch' || key === 'branchname' || key === 'name') out.branchName = val;
                if (key === 'group_cd' || key === 'group' || key === 'groupcode') out.groupCode = val;
            }
            if (out.branchName || out.deviceCode || out.groupCode) {
                deviceConfig = out;
                if (branchNameSpan && out.branchName) branchNameSpan.textContent = out.branchName;
                if (out.groupCode) localStorage.setItem('petmon.group_cd', out.groupCode);
                if (out.deviceCode) localStorage.setItem('petmon.device', out.deviceCode);
                if (out.branchName) localStorage.setItem('petmon.branch', out.branchName);
                return;
            }
        } catch {}
    }
    if (branchNameSpan) branchNameSpan.textContent = '';
}

// ====== 파일 선택으로 C:\\petmon.ini 불러오기 ======
// 단축키: Ctrl+Alt+I 누르고 ini 파일 적용
function parseIniText(text) {
    const out = { deviceCode: undefined, branchName: undefined, groupCode: undefined };
    const lines = String(text || '').split(/\r?\n/);
    for (const raw of lines) {
        const line = (raw || '').trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) continue;
        const m = line.match(/^([^=:#]+)\s*[:=]\s*(.*)$/);
        if (!m) continue;
        const key = m[1].trim().toLowerCase();
        const val = m[2].trim();
        if (key === 'device' || key === 'devicecode' || key === 'code') out.deviceCode = val;
        if (key === 'branch' || key === 'branchname' || key === 'name') out.branchName = val;
        if (key === 'group_cd' || key === 'group' || key === 'groupcode') out.groupCode = val;
    }
    return out;
}

async function pickAndLoadIni() {
    if (!window.showOpenFilePicker) {
        alert('이 브라우저는 파일 선택 API를 지원하지 않습니다. Chrome/Edge 최신 버전을 사용해주세요.');
        return;
    }
    try {
        const [handle] = await window.showOpenFilePicker({
            multiple: false,
            types: [
                {
                    description: 'INI files',
                    accept: { 'text/plain': ['.ini', '.txt'] },
                },
            ],
            excludeAcceptAllOption: false,
        });
        const file = await handle.getFile();
        const text = await file.text();
        const parsed = parseIniText(text);
        if (!parsed.branchName && !parsed.deviceCode && !parsed.groupCode) {
            alert('유효한 ini 형식이 아닙니다. (예: device=SW0001, branch=홍대점, group_cd=suwon)');
            return;
        }
        deviceConfig = parsed;
        if (branchNameSpan && parsed.branchName) branchNameSpan.textContent = parsed.branchName;
        try {
            if (parsed.branchName) localStorage.setItem('petmon.branch', parsed.branchName);
            if (parsed.deviceCode) localStorage.setItem('petmon.device', parsed.deviceCode);
            if (parsed.groupCode) localStorage.setItem('petmon.group_cd', parsed.groupCode);
        } catch {}
        alert('설정이 적용되었습니다.');
    } catch (e) {
        // 사용자가 취소한 경우 등은 무시
        console.debug('INI 선택 취소 또는 오류:', e);
    }
}

// 전역에 노출
if (typeof window !== 'undefined') {
    window.pickAndLoadIni = pickAndLoadIni;
    // 초기 지점명/기기코드/group_cd 로드
    loadDeviceConfig();
}

// 투입 횟수 누적
let depositCount = 0;
let isFinalizing = false;
// 엔드포인트 API 호출
let lastPointApi = { mobile: null, count: 0, result: null };

// ====== 전체 페트병 개수 관리 (localStorage) ======
function getTotalBottleCount() {
    try {
        const count = localStorage.getItem('petmon.totalBottles');
        return count ? parseInt(count, 10) : 0;
    } catch {
        return 0;
    }
}

function setTotalBottleCount(count) {
    try {
        localStorage.setItem('petmon.totalBottles', String(count));
    } catch (e) {
        console.error('localStorage 저장 실패:', e);
    }
}

function incrementBottleCount() {
    const current = getTotalBottleCount();
    const newCount = current + 1;
    setTotalBottleCount(newCount);
    return newCount;
}

function checkAndRedirectToCollection() {
    const count = getTotalBottleCount();
    if (count >= 700) {
        // 700개 이상이면 2초 후 collection.html로 이동
        setTimeout(() => {
            window.location.href = 'collection.html';
        }, 2000);
        return true;
    }
    return false;
}

function updateMachineStatusDisplay() {
    const machineStatus = document.getElementById('machine-status');
    if (!machineStatus) return;

    const inMaintenance = !!(window && window.__maintenanceMode);
    const hardLock = !!(window && window.__hardLock);

    // 진짜 투입 불가일 때만 투입 불가 표시
    if (inMaintenance || hardLock) {
        machineStatus.textContent = '투입 불가';
        machineStatus.style.color = '#ff4d4d';
    } else {
        // 기본값은 항상 개수로 표시
        const count = getTotalBottleCount();
        machineStatus.textContent = `${count}개`;
        machineStatus.style.color = '#00ff4c';
    }
}

// ====== OPFS 기반 포인트 결과 로그 ======
async function appendPointLog(line) {
    try {
        if (!navigator?.storage?.getDirectory) return; // 지원 안하면 무시
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('petmon', { create: true });
        const file = await dir.getFileHandle('point_log.txt', { create: true });
        const existing = await file.getFile();
        const writer = await file.createWritable({ keepExistingData: true });
        try {
            await writer.seek(existing.size);
            await writer.write(line + '\n');
        } finally {
            await writer.close();
        }
    } catch (e) {
        console.debug('appendPointLog failed (ignored):', e);
    }
}
function nowTs() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
        d.getFullYear() +
        '-' +
        pad(d.getMonth() + 1) +
        '-' +
        pad(d.getDate()) +
        ' ' +
        pad(d.getHours()) +
        ':' +
        pad(d.getMinutes()) +
        ':' +
        pad(d.getSeconds())
    );
}

// ====== 전역 에러 로그 ======
// - 사용자 지정 파일: File System Access API로 선택
// - Node/Electron: C:\\petmon\\log\\errorlog.txt 로 기록
// - 브라우저: OPFS(petmon/log/errorlog.txt)
let __errorFileHandle = null;

function __idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('petmon-db', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('fs-handles')) db.createObjectStore('fs-handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
function __idbPut(store, key, val) {
    return __idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(store, 'readwrite');
                tx.objectStore(store).put(val, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }),
    );
}
function __idbGet(store, key) {
    return __idbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            }),
    );
}

async function __verifyFsPermission(handle, mode = 'readwrite') {
    try {
        if (!handle || !handle.queryPermission || !handle.requestPermission) return false;
        const opts = { mode };
        const q = await handle.queryPermission(opts);
        if (q === 'granted') return true;
        const r = await handle.requestPermission(opts);
        return r === 'granted';
    } catch {
        return false;
    }
}

async function setErrorLogFileManually() {
    if (!window.showSaveFilePicker) {
        alert('이 브라우저는 파일 직접 경로 선택을 지원하지 않습니다. (Chromium 기반 필요)');
        return null;
    }
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'errorlog.txt',
            types: [
                {
                    description: 'Text Log',
                    accept: { 'text/plain': ['.txt'] },
                },
            ],
        });
        const ok = await __verifyFsPermission(handle, 'readwrite');
        if (!ok) {
            alert('파일 쓰기 권한이 필요합니다. 다시 선택해주세요.');
            return null;
        }
        __errorFileHandle = handle;
        try {
            await __idbPut('fs-handles', 'errorLogFile', handle);
        } catch {}
        alert('에러 로그가 해당 파일에 자동 저장됩니다.');
        return handle;
    } catch (e) {
        console.debug('사용자 지정 에러 로그 파일 선택 취소/오류:', e);
        return null;
    }
}

async function __appendToSelectedFile(line) {
    try {
        const handle = __errorFileHandle || (await __idbGet('fs-handles', 'errorLogFile'));
        if (!handle) return false;
        __errorFileHandle = handle; // 캐시
        const ok = await __verifyFsPermission(handle, 'readwrite');
        if (!ok) return false;
        // 기존 내용 뒤에 추가
        const file = await handle.getFile();
        const writer = await handle.createWritable({ keepExistingData: true });
        try {
            await writer.seek(file.size);
            await writer.write(String(line) + '\n');
        } finally {
            await writer.close();
        }
        return true;
    } catch (e) {
        console.debug('선택 파일로 에러 로그 기록 실패, 다음 경로로 폴백:', e);
        return false;
    }
}
function __errorToText(err) {
    try {
        if (!err && err !== 0) return '';
        if (err instanceof Error) return err.stack || err.message || String(err);
        if (typeof err === 'object') {
            // 순환 참조 방지로 메모리 누수 방지
            try {
                return JSON.stringify(err);
            } catch {
                return String(err);
            }
        }
        return String(err);
    } catch {
        return '';
    }
}

async function chooseSerialPort() {
    try {
        if (!('serial' in navigator)) {
            alert('이 브라우저는 Web Serial API를 지원하지 않습니다. Chrome/Edge 최신 버전을 사용해주세요.');
            return;
        }
        // 1) 포트 선택
        const selected = await navigator.serial.requestPort();

        // 2) 이전 포트 정리
        if (port && port !== selected) {
            try {
                if (reader) {
                    await reader.cancel();
                    reader.releaseLock();
                }
            } catch {}
            try {
                if (writer) writer.releaseLock();
            } catch {}
            try {
                await port.close();
            } catch {}
        }

        // 3) 새 포트 연결
        port = selected;
        if (!port.readable && !port.writable) {
            await port.open({ baudRate: 9600 });
        }
        const decoder = new TextDecoderStream();
        port.readable.pipeTo(decoder.writable);
        reader = decoder.readable.getReader();

        const encoder = new TextEncoderStream();
        encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        isConnected = true;

        // UI 상태 갱신
        const isErrorVisible = document.getElementById('error-screen')?.style.display === 'flex';
        const hardLock = !!(typeof window !== 'undefined' && window.__hardLock);
        if (window && !isErrorVisible && !hardLock) {
            window.__maintenanceMode = false;
            if (window.startPeriodicStatusCheck) window.startPeriodicStatusCheck();
        }
        const arduinoStatus = document.getElementById('arduino-status');
        if (arduinoStatus) {
            arduinoStatus.textContent = '정상';
            arduinoStatus.style.color = '#00ff4c';
        }
        updateMachineStatusDisplay();
        if (document.getElementById('main-screen')?.style.display === 'flex') {
            updateLoginButtonByStatus();
        }
    } catch (err) {
        console.error('포트 선택 실패:', err);
        showConfirmModal({
            title: '포트 선택 실패',
            lines: [String(err?.message || err)],
            yesText: '확인',
            noText: '닫기',
            onYes: () => {},
            onNo: () => {},
        });
    }
}
async function appendErrorLog(line) {
    // 누가 에러를 냈는지 추적 가능
    try {
        const mobileTag = currentPhoneNumber || '-';
        line = `[mobile:${mobileTag}] ${String(line)}`;
    } catch (e) {
        // 무시하고 진행
    }

    // 지정 파일에 기록 시도
    try {
        if (await __appendToSelectedFile(line)) return; // 성공 시 끝
    } catch {}

    // 1) Electron 환경이면 고정 경로(C:\\petmon\\log\\errorlog.txt)에 기록
    try {
        const hasWinRequire = typeof window !== 'undefined' && typeof window.require === 'function';
        const isElectron = !!(typeof process !== 'undefined' && process.versions && process.versions.electron);
        const canRequire = hasWinRequire || typeof require === 'function';
        if (canRequire && (isElectron || typeof process !== 'undefined')) {
            const req = hasWinRequire ? window.require : require;
            const fs = req('fs');
            const path = req('path');
            const dir = 'C:\\petmon\\log'; // 요청 경로로 변경
            const filePath = path.join(dir, 'errorlog.txt');
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.appendFile(filePath, String(line) + '\n', 'utf8');
            return; // 성공 시 종료
        }
    } catch (e) {
        // 일반 웹 환경일 때 경로 기록 실패 -> OPFS로
        console.debug('Windows 경로 에러 로그 기록 실패, OPFS로 폴백합니다:', e);
    }

    // 2) 브라우저 OPFS -> petmon/log/errorlog.txt
    try {
        if (!navigator?.storage?.getDirectory) return; // 미지원 시 중단
        const root = await navigator.storage.getDirectory();
        const dir1 = await root.getDirectoryHandle('petmon', { create: true });
        const dir2 = await dir1.getDirectoryHandle('log', { create: true });
        const fh = await dir2.getFileHandle('errorlog.txt', { create: true });
        const existing = await fh.getFile();
        const writer = await fh.createWritable({ keepExistingData: true });
        try {
            await writer.seek(existing.size);
            await writer.write(String(line) + '\n');
        } finally {
            await writer.close();
        }
    } catch (e) {
        console.debug('OPFS 에러 로그 기록 실패(무시):', e);
    }
}

// console.error 따와서 에러도 파일에 남김
const __origConsoleError = console.error.bind(console);
console.error = function (...args) {
    try {
        const line = `[${nowTs()}] CONSOLE_ERROR ${args.map((a) => __errorToText(a)).join(' ')}`;
        appendErrorLog(line);
    } catch {}
    return __origConsoleError(...args);
};

/**callPointApi는 unique key + group_cd 포함해 전송 */
async function callPointApi(mobileWithHyphens, count) {
    if (__testMode) {
        return Promise.resolve({ status: 'ok', test: true, mobile: mobileWithHyphens, input_cnt: count });
    }
    // petcycle 도메인 + JSON 방식 + unique key + group_cd 포함
    const apiUrl = POINT_API_URL;
    const payload = {
        mobile: String(mobileWithHyphens || ''),
        input_cnt: Number(count),
        device: deviceConfig.deviceCode || 'UNKNOWN',
        group_cd: getGroupCode() || 'etc',
        client_unique_id: newClientUniqueId(),
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const text = await response.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = text;
        }

        if (!response.ok) {
            const errMsg = parsed && parsed.message ? parsed.message : `HTTP 오류: ${response.status}`;
            throw new Error(errMsg);
        }
        return parsed;
    } catch (error) {
        console.error('포인트 API 호출 실패:', error);
        throw error;
    }
}

// 회원 확인 API 호출
async function callMemberApi(mobileWithHyphens) {
    const apiUrl = MEMBER_API_URL;
    const payload = {
        mobile: String(mobileWithHyphens || ''),
        device: deviceConfig.deviceCode || 'UNKNOWN',
        group_cd: getGroupCode() || 'etc',
        client_unique_id: newClientUniqueId(),
    };
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    let parsed;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = text;
    }
    if (!res.ok) {
        const msg = parsed && parsed.message ? parsed.message : `HTTP 오류: ${res.status}`;
        throw new Error(msg);
    }
    return parsed;
}

// 누적 투입 횟수로 API 호출 후 메인으로 복귀
async function finalizeAndReturnHome() {
    if (isFinalizing) return;
    isFinalizing = true;
    let result = null;
    try {
        if (currentPhoneNumber && depositCount > 0) {
            // callPointApi는 unique key + group_cd 포함해 전송
            result = await callPointApi(currentPhoneNumber, depositCount);
            if (result && result.status === 'error') {
                const logLineErr = `[${nowTs()}] RESULT=ERROR device=${
                    deviceConfig.deviceCode || 'UNKNOWN'
                } mobile=${currentPhoneNumber} count=${depositCount} msg=${
                    (result && (result.message || result)) || ''
                }`;
                appendPointLog(logLineErr);
                console.error('포인트 API 응답 오류:', result.message || result);
            } else {
                const logLineOk = `[${nowTs()}] RESULT=OK device=${
                    deviceConfig.deviceCode || 'UNKNOWN'
                } mobile=${currentPhoneNumber} count=${depositCount} raw=${JSON.stringify(result)}`;
                appendPointLog(logLineOk);
            }
        }
    } catch (err) {
        const logLineEx = `[${nowTs()}] RESULT=EXCEPTION device=${
            deviceConfig.deviceCode || 'UNKNOWN'
        } mobile=${currentPhoneNumber} count=${depositCount} error=${(err && (err.message || err)) || ''}`;
        appendPointLog(logLineEx);
        console.error('포인트 적립 중 예외 발생:', err);
    } finally {
        depositCount = 0;
        showScreen('main-screen');
        isFinalizing = false;
    }
}

// ========== 화면 전환 ==========
function showScreen(screenId) {
    // 화면 전환 전 안내 화살표 숨기기
    hideBottomArrow();

    document.querySelectorAll('.screen').forEach((s) => (s.style.display = 'none'));
    document.getElementById(screenId).style.display = 'flex';

    // 프로세스 중엔 상태 점검 검사 중단, 메인 복귀 시 재시작
    try {
        if (window) {
            if (screenId === 'process-screen') {
                if (window.stopPeriodicStatusCheck) window.stopPeriodicStatusCheck();
            } else if (screenId === 'main-screen') {
                if (!window.__hardLock && window.startPeriodicStatusCheck) window.startPeriodicStatusCheck();
            }
        }
    } catch {}

    // 상태 위치 이동
    if (statusSection && statusHostMain && statusHostProcess) {
        if (screenId === 'process-screen') {
            statusHostProcess.appendChild(statusSection);
        } else {
            statusHostMain.appendChild(statusSection);
        }
    }

    // 메인 화면 복귀 시 시작 버튼을 상태체크 규칙으로 갱신
    if (screenId === 'main-screen' && loginButton) {
        loginPopup.style.display = 'none';
        updateLoginButtonByStatus();
        updateMachineStatusDisplay();

        // 5개 이상이면 collection.html로 이동
        if (checkAndRedirectToCollection()) {
            return;
        }

        // X 신호 전송 후 새로고침
        (async () => {
            if (writer) {
                try {
                    await writeCmdWithAck('STOP');
                    console.log('메인 화면 복귀: STOP 신호 전송 완료');
                } catch (e) {
                    console.error('메인 화면 복귀 시 STOP 전송 실패:', e);
                }
            }

            // 테스트 모드 시 잔여 큐 비우기
            if (__testMode) {
                __simQueue = [];
                __simPaused = false;
            }

            // 세션 초기화
            phoneNumberInput.value = '';
            currentPhoneNumber = '';
            depositCount = 0;
            const fill = document.getElementById('process-progress-fill');
            if (fill) fill.style.width = '0%';

            // X 전송 후 새로고침
            // setTimeout(() => {
            //     window.location.reload();
            // }, 100);
        })();

        return; // 이후 코드 실행 방지
    }
    // jam-screen은 waitForSensor2WithJamDetection 함수 처리됨
    if (screenId === 'end-screen') {
        let countdown = 10;
        const endScreen = document.getElementById('end-screen');
        endScreen.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;">
                <div style="margin-bottom:24px;">
                    <img src="${ICONS.success}" alt="success" width="100" height="100"/>
                </div>
                <div style="font-size:2.4rem;font-weight:bold;color:#3772ff;margin-bottom:12px;">
                    포인트 적립 중...
                </div>
                <div id="end-details" style="font-size:1.2rem;color:#e8eefc;margin-bottom:8px;text-align:center;"></div>
                <div id="end-summary" style="font-size:1.4rem;color:#ffffff;margin-bottom:16px;text-align:center;"></div>
                <div style="font-size:1.1rem;color:#dbe6ff;margin-bottom:24px;text-align:center;">
                    참여해주셔서 감사합니다.<br>
                    <span id="end-countdown" style="color:#fff;font-weight:bold;">${countdown}</span>초 뒤 처음 화면으로 돌아갑니다.
                </div>
                <button id="add-more-button" style="font-size:1.2rem;padding:10px 28px;background:#3772ff;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-bottom:12px;" disabled>
                    페트병 더 넣기
                </button>
                <button id="return-home" style="font-size:1.2rem;padding:10px 28px;background:#fff;color:#3772ff;border:2px solid #3772ff;border-radius:8px;cursor:pointer;" disabled>
                    처음 화면으로
                </button>
            </div>
        `;

        // TTS 음성 안내
        speakText('포인트 적립 중입니다. 참여해 주셔서 감사합니다.');

        // 카운트다운
        const countdownText = document.getElementById('end-countdown');
        countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownText.textContent = countdown;
            } else clearInterval(countdownInterval);
        }, 1000);

        // 즉시 포인트 API 호출하여 요약 표시
        (async () => {
            const details = document.getElementById('end-details');
            const summary = document.getElementById('end-summary');
            const btnMore = document.getElementById('add-more-button');
            const btnHome = document.getElementById('return-home');
            try {
                const m = currentPhoneNumber;
                const cnt = depositCount;
                details.textContent = `방금 투입한 개수: ${cnt}개`;

                let res = null;
                if (m && cnt > 0) {
                    res = await callPointApi(m, cnt);
                    lastPointApi = { mobile: m, count: cnt, result: res };

                    // 성공, 형식별 처리
                    const data = res?.data || res; // 서버 형식
                    const inputCnt = Number(data?.input_cnt ?? cnt);
                    const inputPoint = Number(data?.input_point ?? inputCnt * 10);
                    const totalPoint = data?.total_point;

                    // 성공 로그
                    const logLineOk = `[${nowTs()}] RESULT=OK device=${
                        deviceConfig.deviceCode || 'UNKNOWN'
                    } mobile=${m} count=${cnt} raw=${JSON.stringify(res)}`;
                    appendPointLog(logLineOk);

                    summary.innerHTML = `
                        <div><strong>${inputPoint}포인트</strong>가 적립되었습니다.</div>
                        ${totalPoint != null ? `<div>현재 보유 포인트: <strong>${totalPoint}</strong>점</div>` : ''}
                    `;
                } else {
                    summary.textContent = '전화번호 또는 투입 수량이 없어 적립을 진행하지 않았습니다.';
                }
            } catch (err) {
                // 예외 로그
                const logLineEx = `[${nowTs()}] RESULT=EXCEPTION device=${
                    deviceConfig.deviceCode || 'UNKNOWN'
                } mobile=${currentPhoneNumber} count=${depositCount} error=${(err && (err.message || err)) || ''}`;
                appendPointLog(logLineEx);
                summary.innerHTML = `<span style="color:#ffb3b3;">포인트 적립 중 오류가 발생했습니다. 나중에 다시 시도해주세요.</span>`;
                console.error('포인트 적립 중 예외 발생(End Screen):', err);
            } finally {
                // 적립 성공 시 이후 중복 적립 방지 위해 카운트 리셋
                // 실패시 리셋 X
                if (lastPointApi?.result) {
                    depositCount = 0;
                }
                if (btnMore) btnMore.disabled = false;
                if (btnHome) btnHome.disabled = false;

                // 자동 복귀 타이머
                autoReturnTimeout = setTimeout(() => {
                    finalizeAndReturnHome();
                }, 10000);
            }
        })();

        // 버튼 이벤트 재연결
        document.getElementById('add-more-button').onclick = async () => {
            clearTimeout(autoReturnTimeout);
            clearInterval(countdownInterval);
            const btn = document.getElementById('add-more-button');
            if (btn) btn.disabled = true;

            // 700개 이상이면 가득 찼다는 화면 먼저 표시
            const count = getTotalBottleCount();
            if (count >= 700) {
                const fullScreen = document.getElementById('end-screen');
                if (fullScreen) {
                    fullScreen.innerHTML = `
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;">
                            <div style="margin-bottom:24px;">
                                <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="#ff6b6b" stroke-width="2" fill="none"/>
                                    <path d="M12 7v6M12 16h.01" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>
                                </svg>
                            </div>
                            <div style="font-size:2.4rem;font-weight:bold;color:#ff6b6b;margin-bottom:20px;text-align:center;">
                                페트병이 가득 찼습니다!
                            </div>
                            <div style="font-size:1.5rem;color:#e8eefc;margin-bottom:32px;text-align:center;">
                                더 이상 넣을 수 없습니다.<br>
                                수거 후 이용 가능합니다.
                            </div>
                        </div>
                    `;
                }

                // 3초 후 모터 정지 및 메인으로 이동
                setTimeout(async () => {
                    try {
                        if (writer) {
                            await writeCmdWithAck('STOP');
                            console.log('5개 도달: 모터 정지 완료');
                        }
                    } catch (e) {
                        console.error('5개 도달: 모터 정지 실패:', e);
                    }
                    finalizeAndReturnHome();
                }, 3000);
                return;
            }

            try {
                // 로그인(LOGIN_USER) 전송 후 잠시 대기 -> 띠 분리기부터 재시작
                await writeCmdWithAck('LOGIN_USER');
                // ACK 수신 후 확인, 짧은 대기 후 진행
                await new Promise((r) => setTimeout(r, 200));
                isStopped = false;
                stopButton.disabled = false;
                await startProcess();
            } finally {
                // startProcess로 화면 전환되므로 안정성 확보를 위해 복구
                if (btn) btn.disabled = false;
            }
        };
        document.getElementById('return-home').onclick = async () => {
            clearTimeout(autoReturnTimeout);
            clearInterval(countdownInterval);

            // 700개 이상이면 가득 찼다는 화면 먼저 표시
            const count = getTotalBottleCount();
            if (count >= 700) {
                const fullScreen = document.getElementById('end-screen');
                if (fullScreen) {
                    fullScreen.innerHTML = `
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;">
                            <div style="margin-bottom:24px;">
                                <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="#ff6b6b" stroke-width="2" fill="none"/>
                                    <path d="M12 7v6M12 16h.01" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round"/>
                                </svg>
                            </div>
                            <div style="font-size:2.4rem;font-weight:bold;color:#ff6b6b;margin-bottom:20px;text-align:center;">
                                페트병이 가득 찼습니다!
                            </div>
                            <div style="font-size:1.5rem;color:#e8eefc;margin-bottom:32px;text-align:center;">
                                수거 후 이용 가능합니다.<br>
                                잠시 후 처음 화면으로 돌아갑니다.
                            </div>
                        </div>
                    `;
                }

                // 3초 후 모터 정지 및 메인으로 이동
                setTimeout(async () => {
                    try {
                        if (writer) {
                            await writeCmdWithAck('STOP');
                            console.log('5개 도달: 모터 정지 완료');
                        }
                    } catch (e) {
                        console.error('5개 도달: 모터 정지 실패:', e);
                    }
                    finalizeAndReturnHome();
                }, 3000);
                return;
            }

            finalizeAndReturnHome();
        };
    } else {
        clearTimeout(autoReturnTimeout);
        clearInterval(countdownInterval);
        try {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        } catch {}
    }

    // 메인화면으로 돌아갈 때 FA-Duino에 'X' 신호 전송 및 세션 초기화
    if (screenId === 'main-screen') {
        // 타이머 리셋
        try {
            clearTimeout(errorAutoTimer);
        } catch {}
        try {
            clearInterval(errorCountdownTimer);
        } catch {}

        try {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        } catch {}
        // 자동 종료 플래그/닫기 버튼 정리
        __inactivityExitInProgress = false;
        if (closeDoorButton?.parentNode) {
            try {
                closeDoorButton.parentNode.removeChild(closeDoorButton);
            } catch {}
        }

        if (writer) {
            // 비동기로 STOP 전송 및 ACK 대기
            writeCmdWithAck('STOP').catch((e) => {
                console.error('메인 화면 복귀 시 STOP 전송 실패:', e);
            });
        }
        // 테스트 모드 시 잔여 큐 비우기
        if (__testMode) {
            __simQueue = [];
            __simPaused = false;
        }

        phoneNumberInput.value = '';
        currentPhoneNumber = '';
        depositCount = 0; // 세션 종료 시 카운트 초기화
        const fill = document.getElementById('process-progress-fill');
        if (fill) fill.style.width = '0%';
    }
}

// 오류 화면 표시 및 점검 모드 전환
function showErrorScreen(message) {
    // 첫 에러 이후 세션 하드락
    if (typeof window !== 'undefined') window.__hardLock = true;

    // 에러 스크린 한 번만 표시하도록 함
    if (__errorShownOnce) return;
    __errorShownOnce = true;

    try {
        clearTimeout(errorAutoTimer);
        clearInterval(errorCountdownTimer);
    } catch {}
    // 에러 화면 진입 시 로그
    try {
        appendErrorLog(`[${nowTs()}] SHOW_ERROR_SCREEN ${String(message || '')}`);
    } catch {}
    // 유지보수 모드 진입 및 주기 체크 중단
    if (window) {
        window.__maintenanceMode = true;
        if (window.stopPeriodicStatusCheck) {
            window.stopPeriodicStatusCheck();
        }
    }
    // 상태를 점검중으로 표시
    const arduinoStatus = document.getElementById('arduino-status');
    if (arduinoStatus) {
        arduinoStatus.textContent = '준비 중';
        arduinoStatus.style.color = '#ff4d4d';
    }

    updateMachineStatusDisplay(); // 불가능 상태로 표시
    // 로그인 버튼 비활성화 및 상태 변경
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.textContent = '고객센터 : 1644-1224';
    }

    const msgEl = document.getElementById('error-message');
    if (msgEl) msgEl.textContent = message || '기기 오류가 발생했습니다. 관리자에게 문의해주세요.';
    const phoneEl = document.getElementById('error-phone');
    if (phoneEl) phoneEl.textContent = `입력한 전화번호: ${currentPhoneNumber || '-'}`;
    showScreen('error-screen');

    // TTS 음성 안내
    speakText('기기 오류가 발생했습니다. 관리자에게 문의해 주세요. 고객센터 전화번호는 1644-1224 입니다.');

    const callBtn = document.getElementById('call-support');
    if (callBtn) {
        // 표시만 하고 클릭 불가
        callBtn.disabled = true; // 버튼 비활성
        callBtn.setAttribute('aria-disabled', 'true');
        callBtn.style.cursor = 'not-allowed';
        callBtn.style.opacity = '0.8';
        callBtn.onclick = null; // 기존 핸들러 제거
        callBtn.style.pointerEvents = 'none'; // 사용자가 보이는 UI 클릭 차단
    }
    const ret = document.getElementById('error-return-home');
    if (ret) {
        ret.onclick = () => {
            clearTimeout(errorAutoTimer);
            clearInterval(errorCountdownTimer);
            showScreen('main-screen');
        };
    }

    // 10초 카운트다운 후 메인으로
    let sec = 10;
    const cd = document.getElementById('error-countdown');
    if (cd) cd.textContent = '10초 뒤 처음 화면으로 돌아가며, 장비 상태는 점검중으로 전환됩니다.';
    errorCountdownTimer = setInterval(() => {
        sec--;
        if (cd) cd.textContent = `${sec}초 뒤 처음 화면으로 돌아가며, 장비 상태는 점검중으로 전환됩니다.`;
        if (sec <= 0) clearInterval(errorCountdownTimer);
    }, 1000);
    errorAutoTimer = setTimeout(() => {
        showScreen('main-screen');
    }, 10000);
    takePhotoAndSave('err_');
}

// ========== 프로세스 실행 ==========
// 외부 SVG 아이콘
// 필요한 것만 사용
const ICONS = {
    // 상태 및 단계
    openDoor: 'https://api.iconify.design/mdi/door-open.svg?color=%233772ff&width=90&height=90',
    closeDoor: 'https://api.iconify.design/mdi/door-closed.svg?color=%23ff6b6b&width=90&height=90',
    label: 'https://api.iconify.design/mdi/label-outline.svg?color=%233772ff&width=90&height=90',
    scan: 'https://api.iconify.design/mdi/magnify.svg?color=%233772ff&width=90&height=90',
    collect: 'https://api.iconify.design/mdi/recycle-variant.svg?color=%233772ff&width=90&height=90',
    // 피드백 알림
    success: 'https://api.iconify.design/mdi/check-circle-outline.svg?color=%233772ff&width=100&height=100',
    warn: 'https://api.iconify.design/mdi/alert-circle-outline.svg?color=%23ff4d4d&width=90&height=90',
    hand: 'https://api.iconify.design/mdi/hand-back-right.svg?color=%23ff4d4d&width=90&height=90',
    stop: 'https://api.iconify.design/mdi/cog.svg?color=%233772ff&width=90&height=90',
    jam: 'https://api.iconify.design/mdi/alert-octagon-outline.svg?color=%23ff4d4d&width=90&height=90',
};

// 단계별 배경색
const processBgColors = [
    '#e3f0ff', // 문 열림
    '#ffeaea', // 문 닫힘/손조심
    '#f0f6ff', // 판별중
    '#f3f7ff', // 수집중
];

// ========== TTS (Text-to-Speech) 기능 ==========
function speakText(text) {
    try {
        // 기존 음성 중지
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        // HTML 태그 제거
        const cleanText = text
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]*>/g, '')
            .trim();

        if (!cleanText) return;

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ko-KR'; // 한국어
        utterance.rate = 1.0; // 속도
        utterance.pitch = 1.0; // 음높이
        utterance.volume = 1.0; // 볼륨 최대

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.error('TTS 오류:', e);
    }
}

// 아이콘 + 메시지 + 배경 렌더링
function renderProcess(iconKey, message, bgIndex, { spin = false, iconAlt = '' } = {}) {
    try {
        const iconUrl = ICONS[iconKey] || ICONS.scan;
        const spinClass = spin ? 'spin' : '';
        const accent =
            iconKey === 'openDoor'
                ? 'open'
                : iconKey === 'closeDoor'
                  ? 'close'
                  : iconKey === 'scan'
                    ? 'scan'
                    : iconKey === 'collect'
                      ? 'collect'
                      : iconKey === 'hand'
                        ? 'warn'
                        : iconKey === 'stop'
                          ? 'stop'
                          : 'label';

        const iconHtml =
            iconKey === 'label'
                ? `<svg width="90" height="90" viewBox="0 0 90 90" fill="none" aria-hidden="true">
                                 <circle cx="45" cy="45" r="14" fill="#ffffff" stroke="#3772ff" stroke-width="4"/>
                                 <polygon points="40,18 50,18 45,38" fill="#f59e0b" stroke="#fbbf24" stroke-width="2"/>
                                 <polygon points="40,72 50,72 45,52" fill="#f59e0b" stroke="#fbbf24" stroke-width="2"/>
                             </svg>`
                : `<img src="${iconUrl}" alt="${iconAlt || ''}" width="90" height="90"/>`;
        processMessage.innerHTML = `
            <div class="process-hero accent-${accent}">
                <div class="icon-bubble ${spinClass}">${iconHtml}</div>
                <div class="process-title">${message}</div>
            </div>
        `;
        const box = document.querySelector('.process-box');
        if (box) {
            box.classList.remove(
                'theme-open',
                'theme-close',
                'theme-scan',
                'theme-collect',
                'theme-label',
                'theme-warn',
                'theme-stop',
            );
            box.classList.add(`theme-${accent}`);
        }
        const fill = document.getElementById('process-progress-fill');
        if (fill) {
            let pct = 0;
            if (iconKey === 'label') pct = 10;
            else if (iconKey === 'openDoor') pct = 30;
            else if (iconKey === 'closeDoor') pct = 50;
            else if (iconKey === 'scan') pct = 75;
            else if (iconKey === 'collect') pct = 95;
            fill.style.width = pct + '%';
        }

        // 띠 분리기 단계에서만 화살표 표시
        if (iconKey === 'label') {
            showBottomArrowAt(1047);
        } else {
            hideBottomArrow();
        }

        // TTS 음성 안내
        speakText(message);
    } catch (e) {
        // 렌더링 실패 시 텍스트만 표시하기
        processMessage.textContent = message;
    }
}

// 문 열림/닫힘
const SVG_OPEN = `
<svg width="90" height="90" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="24" fill="#fff" stroke="#23262f" stroke-width="3"/>
  <circle cx="32" cy="10" r="24" ry="10" fill="#3772ff" stroke="#23262f" stroke-width="3"/>
 </svg>`;
const SVG_CLOSE = `
<svg width="90" height="90" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="32" r="24" fill="#3772ff" stroke="#23262f" stroke-width="3"/>
 </svg>`;

function renderOpenDoorOriginal(messageHtml) {
    // 띠 분리기 단계에서만 표시 후 화살표 숨기기
    hideBottomArrow();

    processMessage.innerHTML = `
        <div class="process-hero accent-open">
            <div class="icon-bubble">${SVG_OPEN}</div>
            <div class="process-title">${messageHtml}</div>
        </div>
    `;
    const box = document.querySelector('.process-box');
    if (box) {
        box.classList.remove('theme-close', 'theme-scan', 'theme-collect', 'theme-label', 'theme-warn', 'theme-stop');
        box.classList.add('theme-open');
    }
    const fill = document.getElementById('process-progress-fill');
    console.log('renderOpenDoorOriginal - fill element:', fill);
    if (fill) fill.style.width = '30%';

    // TTS 음성 안내
    speakText(messageHtml);
}

function renderCloseDoorOriginal(messageText) {
    // 띠 분리기 단계에서만 표시 후 화살표 숨기기
    hideBottomArrow();

    processMessage.innerHTML = `
        <div class="process-hero accent-close">
            <div class="icon-bubble">${SVG_CLOSE}</div>
            <div class="process-title">${messageText}</div>
        </div>
    `;
    const box = document.querySelector('.process-box');
    if (box) {
        box.classList.remove('theme-open', 'theme-scan', 'theme-collect', 'theme-label', 'theme-warn', 'theme-stop');
        box.classList.add('theme-close');
    }
    const fill = document.getElementById('process-progress-fill');
    if (fill) fill.style.width = '50%';

    // TTS 음성 안내
    speakText(messageText);
}

// 버튼 충돌 방지 버튼 숨김
function hideProcessButtons() {
    try {
        const ps = document.getElementById('process-screen');
        if (!ps) return;
        ps.querySelectorAll('button').forEach((btn) => {
            btn.style.display = 'none';
            btn.disabled = true;
        });
    } catch {}
}

// 다시 실행 시 버튼 표시
//<button id="stop-button" disabled="">종료하기</button> 다시 나타나도록
function showProcessButtons() {
    try {
        const ps = document.getElementById('process-screen');
        if (!ps) return;
        ps.querySelectorAll('button').forEach((btn) => {
            btn.style.display = 'none';
            btn.disabled = false;
        });
    } catch {
        // 무시함.
    }
}

// 3분 후 텍스트 변경 후 버튼 추가 로직
let inactivityTimeout;
// 중복 실행 방지
let __inactivityExitInProgress = false;

// 2단계 닫힘 완료 신호를 대기하는 함수
async function waitForDoorClosed({ timeoutMs = 20000 } = {}) {
    return waitForAnyArduinoResponse(
        [
            'Door closed ', // 정상 케이스
            'Emergency closing...', // 비상 닫힘 성공
            'Door is already closed', // 예외적으로 이미 닫힘
            'Door stopped.', // 모터 정지 로그(닫힘 직후 공통)
        ],
        { timeoutMs },
    );
}

// 세션 타임아웃, 비활성 3분 후 종료
async function beginGracefulAutoExit() {
    if (__inactivityExitInProgress) return;
    __inactivityExitInProgress = true;

    try {
        // 타이머 및 버튼 정리
        clearTimeout(inactivityTimeout);
        clearTimeout(autoReturnTimeout);
        clearInterval(countdownInterval);
        hideProcessButtons();
        try {
            if (__closeBtnUnlockTimer) {
                clearInterval(__closeBtnUnlockTimer);
                __closeBtnUnlockTimer = null;
            }
        } catch {}

        // 닫기 버튼 제거
        try {
            if (closeDoorButton?.parentNode) {
                closeDoorButton.disabled = true;
                closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
                closeDoorButton.parentNode.removeChild(closeDoorButton);
            }
        } catch {}

        // renderProcess로 테마, 프로세스 갱신
        renderProcess('closeDoor', '입력이 없어 종료합니다.<br>안전을 위해 문을 닫는 중입니다...', 1);

        // 카운트다운버튼 UI 추가만 별도로 붙임
        let countdown = 10;
        const extra = document.createElement('div');
        extra.id = 'inact-extra-ui';
        extra.style.cssText = 'margin-top:16px;text-align:center;';
        extra.innerHTML = `
            <div style="font-size:1rem;color:#dbe6ff;margin-bottom:16px;">
                <span id="inact-countdown" style="color:#fff;font-weight:bold;">${countdown}</span>초 뒤 처음 화면으로 돌아갑니다.
            </div>
            <button id="inact-return-home" style="font-size:1.1rem;padding:10px 24px;background:#fff;color:#3772ff;border:2px solid #3772ff;border-radius:8px;cursor:pointer;">
                처음 화면으로
            </button>
        `;
        processMessage.appendChild(extra);

        // 문 닫기 신호(DOOR_CLOSE) 1회 전송
        try {
            await writeCmdWithAck('DOOR_CLOSE');
            // 모든 설정된 닫힘 완료 메세지 허용 + 짧은 제한
            try {
                await waitForDoorClosed({ timeoutMs: 7000 });
            } catch {}
        } catch (e) {
            if (!handleDeviceLost(e)) console.error('무입력 종료: 문 닫기(2) 전송 실패:', e);
        }

        // 버튼, 카운트다운 동작
        const btnHome = document.getElementById('inact-return-home');
        const cdText = document.getElementById('inact-countdown');

        if (btnHome) {
            btnHome.onclick = () => {
                clearTimeout(autoReturnTimeout);
                clearInterval(countdownInterval);
                showScreen('main-screen'); // 여기서 X 전송 후 세션 초기화
                __inactivityExitInProgress = false;
            };
        }

        countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                if (cdText) cdText.textContent = countdown;
            } else {
                clearInterval(countdownInterval);
            }
        }, 1000);

        autoReturnTimeout = setTimeout(() => {
            showScreen('main-screen'); // 여기서 X 전송 후 세션 초기화
            __inactivityExitInProgress = false;
        }, 10000);
    } catch (err) {
        __inactivityExitInProgress = false;
        if (handleDeviceLost(err)) return;
        console.error('무입력 종료 흐름 중 오류:', err);
        showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
    }
}

function handleInactivity() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
        // end-screen의 복귀 로직과 동일한 흐름으로 종료
        beginGracefulAutoExit();
    }, 180000); // 3분(180000ms). 테스트-15초
}

// // 종료하기 버튼 로직 수정 (포인트 적립 제거)
// async function handleExitButton() {
//     const exitButton = document.createElement('button');
//     exitButton.textContent = '종료하기';
//     exitButton.style =
//         'font-size:1.2rem;padding:10px 28px;background:#ff4d4d;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-top:12px;';
//     exitButton.onclick = async () => {
//         try {
//             clearTimeout(inactivityTimeout); // 비활성 타임아웃 취소
//             clearTimeout(autoReturnTimeout); // 자동 닫힘 타임아웃 취소

//             const commands = [
//                 { cmd: 'DOOR_CLOSE', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
//                 { cmd: 'AI_ZONE_BACK', msg: '자원을 판별하는 중입니다...' },
//                 { cmd: 'AI_ZONE_FWD', msg: '자원을 수집하는 중입니다...' },
//             ];

//             for (let i = 0; i < commands.length; i++) {
//                 if (i === 0) {
//                     renderCloseDoorOriginal(commands[i].msg);
//                 } else if (i === 1) {
//                     renderProcess('scan', commands[i].msg, 2);
//                 } else {
//                     renderProcess('collect', commands[i].msg, 3, { spin: true });
//                 }

//                 await writeCmdWithAck(commands[i].cmd);
//                 await new Promise((r) => setTimeout(r, 50));

//                 if (commands[i].cmd === 'AI_ZONE_BACK') {
//                     // jam 발생 시 반복 처리를 위한 루프 (최대 3번 시도)
//                     let jamRetryCount = 0;
//                     const maxJamRetries = 3;
//                     let jamRecoveryLoop = true;

//                     while (jamRecoveryLoop) {
//                         try {
//                             await waitForSensor2WithJamDetection({ timeoutMs: 30000 });
//                             jamRecoveryLoop = false; // 정상 완료 시 루프 탈출
//                         } catch (jamErr) {
//                             // jam recovery: 닫기 버튼 누름 -> 문 닫기 -> 3 -> 다시 감지
//                             if (jamErr && jamErr.__jamRecovery) {
//                                 jamRetryCount++;

//                                 if (jamRetryCount > maxJamRetries) {
//                                     // 3번 시도 후에도 실패하면 에러 처리
//                                     showErrorScreen(
//                                         '페트병 끼임이 지속됩니다. 기기에 문제가 있을 수 있습니다. 관리자에게 문의해주세요.'
//                                     );
//                                     return;
//                                 }

//                                 // 1. 문 닫기
//                                 renderCloseDoorOriginal('문이 닫힙니다. 손 조심하세요! ⚠️');
//                                 await writeCmdWithAck('DOOR_CLOSE');
//                                 await waitForDoorClosed({ timeoutMs: 20000 });

//                                 // 2. 자원 판별 (3) - 다시 시도하고 루프 계속 (다시 끼임 감지 가능)
//                                 renderProcess(
//                                     'scan',
//                                     `자원을 판별하는 중입니다... (${jamRetryCount}/${maxJamRetries})`,
//                                     2
//                                 );
//                                 await writeCmdWithAck('AI_ZONE_BACK');
//                                 // 루프 계속하여 waitForSensor2WithJamDetection 다시 호출
//                                 continue;
//                             }
//                             throw jamErr;
//                         }
//                     }
//                     await new Promise((r) => setTimeout(r, 1000));
//                 } else if (commands[i].cmd === 'AI_ZONE_FWD') {
//                     await waitForArduinoResponse('Sensor1 reached (LOW).');
//                 } else {
//                     // [CHG] 닫힘 완료 신호 보강 + 여유 타임아웃
//                     await waitForDoorClosed({ timeoutMs: 20000 });
//                 }
//             }

//             // 기존: await writeCmd('X'); // 제거 — showScreen('main-screen')에서 X 전송
//             showScreen('main-screen'); // 메인 화면 전환 시 showScreen 내부에서 X 전송 및 세션 초기화
//         } catch (err) {
//             if (handleDeviceLost(err)) return;
//             console.error('종료 중 오류:', err);
//             showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
//         }
//     };

//     processMessage.appendChild(exitButton);
// }

async function startProcess() {
    // 하드락 상태일 경우 아무 것도 시작하지 않음
    if (typeof window !== 'undefined' && window.__hardLock) {
        updateLoginButtonByStatus?.();
        return;
    }

    clearTimeout(autoReturnTimeout);
    clearTimeout(inactivityTimeout);

    if (!isConnected) {
        await connectToFaduino();
        if (!isConnected) {
            // alert -> 에러 화면
            abortProcessNow('기기 연결이 필요합니다. 관리자에게 문의해주세요.');
            return;
        }
    }

    showProcessButtons();
    showScreen('process-screen');
    isStopped = false;
    //stopButton.disabled = true;

    if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);
    closeDoorButton.disabled = false;

    renderProcess('label', '띠를 먼저 분리해주세요.<br>분리하시면 투입구가 열립니다.', 2);
    const __pf = document.getElementById('process-progress-fill');
    if (__pf) __pf.style.width = '10%';

    // 띠 분리 완료 대기
    try {
        await waitForAnyArduinoResponse(['Belt cutting done!', 'Belt cutting done'], { timeoutMs: 60000 });
    } catch (err) {
        if (handleDeviceLost(err)) return;

        // 띠 분리기 1분 미작동 시 브라우저 새로고침
        const msg = String(err && (err.message || err));
        if (msg.includes('Timeout while waiting for Arduino response')) {
            try {
                appendErrorLog(`[${nowTs()}] LABEL_STAGE_TIMEOUT -> reload`);
            } catch {}
            try {
                sessionStorage.setItem('petmon.stopOnReload', '1');
            } catch {}
            try {
                await teardownSerial();
            } catch {}
            window.location.reload();
            return;
        }

        // 기타 예외는 기존대로 에러 화면
        showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        takePhotoAndSave('err_');
        return;
    }

    // 띠 분리 완료 후 문 열기 명령 전송
    try {
        await writeCmdWithAck('DOOR_OPEN');
    } catch (err) {
        if (handleDeviceLost(err)) return;
        showErrorScreen('문 열기 실패. 관리자에게 문의해주세요.');
        takePhotoAndSave('err_');
        return;
    }

    // 문 열림 안내
    const openMsg = `투입구가 열립니다.<br>띠를 제거한 페트병을 <strong style="color: yellow;">병목</strong>부터 투입해주세요.<br>마지막으로 닫기 버튼을 눌러주세요.`;
    renderOpenDoorOriginal(openMsg);

    // "작동중지" 버튼 옆에 "닫힘" 버튼 추가
    stopButton.parentNode.insertBefore(closeDoorButton, stopButton.nextSibling);
    // 닫기 버튼 3초 카운트다운 후 활성화
    try {
        clearInterval(__closeBtnUnlockTimer);
    } catch {}
    __closeBtnCountdown = 3;
    closeDoorButton.disabled = true;
    closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
    closeDoorButton.textContent = `닫기 (${__closeBtnCountdown})`;
    __closeBtnUnlockTimer = setInterval(() => {
        __closeBtnCountdown -= 1;
        if (__closeBtnCountdown > 0) {
            closeDoorButton.textContent = `닫기 (${'' + __closeBtnCountdown})`;
        } else {
            try {
                clearInterval(__closeBtnUnlockTimer);
            } catch {}
            __closeBtnUnlockTimer = null;
            closeDoorButton.textContent = '닫기';
            closeDoorButton.disabled = false;
            closeDoorButton.style = CLOSE_BTN_ACTIVE_STYLE;
        }
    }, 1000);

    // 비활성 상태 감지 시작
    handleInactivity();

    // 닫힘 -> 판별 -> 수집
    closeDoorButton.onclick = async () => {
        clearTimeout(inactivityTimeout); // 비활성 타임아웃 취소
        try {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        } catch {}
        if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);
        closeDoorButton.disabled = true;
        closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
        try {
            const commands = [
                { cmd: 'DOOR_CLOSE', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
                { cmd: 'AI_ZONE_BACK', msg: '자원을 판별하는 중입니다...' },
                { cmd: 'AI_ZONE_FWD', msg: '자원을 수집하는 중입니다...' },
            ];

            for (let i = 0; i < commands.length; i++) {
                if (i === 0) {
                    renderCloseDoorOriginal(commands[i].msg);
                } else if (i === 1) {
                    renderProcess('scan', commands[i].msg, 2);
                } else {
                    renderProcess('collect', commands[i].msg, 3, { spin: true });
                }

                // AI_ZONE_BACK 전에 LED_TEST 먼저 실행
                if (commands[i].cmd === 'AI_ZONE_BACK') {
                    await writeCmdWithAck('LED_TEST');
                    await waitForArduinoResponse('led blink success', { timeoutMs: 5000 });
                    await new Promise((r) => setTimeout(r, 100));
                }

                await writeCmdWithAck(commands[i].cmd);
                await new Promise((r) => setTimeout(r, 50));

                if (commands[i].cmd === 'AI_ZONE_BACK') {
                    // jam 발생 시 반복 처리를 위한 반복 (최대 3번 시도)
                    let jamRetryCount = 0;
                    const maxJamRetries = 3;
                    let jamRecoveryLoop = true;

                    while (jamRecoveryLoop) {
                        try {
                            await waitForSensor2WithJamDetection({ timeoutMs: 30000 });
                            jamRecoveryLoop = false; // 정상 완료 시 탈출
                            // AI_ZONE_BACK 완료 후 2초 대기
                            await new Promise((r) => setTimeout(r, 2000));
                        } catch (jamErr) {
                            // 메인으로 강제 복귀 (기기 장애 버튼 대응)
                            if (jamErr && jamErr.__forceMain) {
                                try {
                                    renderCloseDoorOriginal('문을 닫는 중입니다. 손 조심하세요! ⚠️');
                                    await writeCmdWithAck('DOOR_CLOSE');
                                    await waitForDoorClosed({ timeoutMs: 20000 });
                                } catch (closeErr) {
                                    console.error('메인 복귀 중 문 닫기 실패:', closeErr);
                                }
                                showScreen('main-screen');
                                return;
                            }

                            // jam recovery
                            //  닫기 버튼 누름 -> 문 닫기 -> 3 -> 다시 감지
                            if (jamErr && jamErr.__jamRecovery) {
                                jamRetryCount++;

                                if (jamRetryCount > maxJamRetries) {
                                    // 3번 시도 후에도 실패하면 에러 처리
                                    try {
                                        // 안전을 위해 문을 먼저 닫기
                                        renderCloseDoorOriginal('문을 닫는 중입니다. 손 조심하세요! ⚠️');
                                        await writeCmdWithAck('DOOR_CLOSE');
                                        await waitForDoorClosed({ timeoutMs: 20000 });
                                    } catch (closeErr) {
                                        console.error('에러 처리 중 문 닫기 실패:', closeErr);
                                    }
                                    showErrorScreen(
                                        '페트병 끼임이 지속됩니다. 기기에 문제가 있을 수 있습니다. 관리자에게 문의해주세요.',
                                    );
                                    return;
                                }

                                // 1. 문 닫기
                                renderCloseDoorOriginal('문이 닫힙니다. 손 조심하세요! ⚠️');
                                await writeCmdWithAck('DOOR_CLOSE');
                                await waitForDoorClosed({ timeoutMs: 20000 });
                                takePhotoAndSave();

                                // 2. 자원 판별 (3) - 다시 시도하고 루프 계속 (다시 끼임 감지 가능)
                                renderProcess('scan', `자원을 판별하는 중입니다... )`, 2);
                                // LED 점멸 먼저 실행
                                await writeCmdWithAck('LED_TEST');
                                await waitForArduinoResponse('led blink success', { timeoutMs: 5000 });
                                await new Promise((r) => setTimeout(r, 100));
                                // 자원 판별 실행
                                await writeCmdWithAck('AI_ZONE_BACK');
                                // 루프 계속하여 waitForSensor2WithJamDetection 다시 호출
                                continue;
                            }
                            throw jamErr;
                        }
                    }
                } else if (commands[i].cmd === 'AI_ZONE_FWD') {
                    // 수집 타임아웃 30초 + 1회 재시도 로직 추가
                    try {
                        await waitForArduinoResponse('Sensor1 reached (LOW).', { timeoutMs: 30000 });
                    } catch (fwdErr) {
                        console.warn('AI_ZONE_FWD 1차 실패, 재시도 수행:', fwdErr);
                        // 재시도: 명령 재전송 후 대기
                        await writeCmdWithAck('AI_ZONE_FWD');
                        await waitForArduinoResponse('Sensor1 reached (LOW).', { timeoutMs: 30000 });
                    }
                    await new Promise((r) => setTimeout(r, 3000));
                } else {
                    await waitForDoorClosed({ timeoutMs: 20000 });
                    takePhotoAndSave();
                }
            }
            depositCount += 1;

            // localStorage에 전체 개수 저장 및 800개 체크
            incrementBottleCount();

            // 화면에 즉시 개수 반영
            updateMachineStatusDisplay();

            showScreen('end-screen');
        } catch (err) {
            if (handleDeviceLost(err)) return;
            console.error('닫힘/판별/수집 중 오류:', err);
            showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
        }
    };

    // 비활성 상태 감지 시작
    handleInactivity();
}

// 진행 중 프로세스를 즉시 중단하고 에러 화면으로 전환
function abortProcessNow(message) {
    try {
        clearTimeout(inactivityTimeout);
    } catch {}
    try {
        clearTimeout(autoReturnTimeout);
    } catch {}
    try {
        clearInterval(countdownInterval);
    } catch {}
    try {
        if (__closeBtnUnlockTimer) {
            clearInterval(__closeBtnUnlockTimer);
            __closeBtnUnlockTimer = null;
        }
    } catch {}
    try {
        if (closeDoorButton?.parentNode) {
            closeDoorButton.disabled = true;
            closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
            closeDoorButton.parentNode.removeChild(closeDoorButton);
        }
    } catch {}
    __inactivityExitInProgress = false;
    showErrorScreen(message || '기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
}

// 공통 정규화 유틸
function normalizeText(s) {
    try {
        return String(s || '')
            .toLowerCase()
            .replace(/\r/g, '');
    } catch {
        return '';
    }
}

// 오류 및 센서 상태 관련 필터링
function __filterOutAlreadyAndSensorStateLines(input) {
    try {
        const lines = String(input || '').split(/\r?\n/);
        const kept = [];
        for (const ln of lines) {
            const n = normalizeText(ln);
            // already 드롭
            if (n.includes('already')) continue;
            // sensor state 드롭
            if (n.includes('sensor state')) continue;
            kept.push(ln);
        }
        return kept.join('\n');
    } catch {
        return input;
    }
}

function waitForArduinoResponse(targetMessage, { timeoutMs = 10000, silent = false } = {}) {
    return withReadLock(
        () =>
            new Promise((resolve, reject) => {
                let timer;

                const scheduleTimeout = (ms) => {
                    try {
                        clearTimeout(timer);
                    } catch {}
                    timer = setTimeout(() => {
                        const err = new Error('Motor malfunction timeout');
                        if (!silent) {
                            abortProcessNow(`기기 오류: 모터 오작동(${Math.round(ms / 1000)}초 내 완료 신호 없음)`);
                        }
                        reject(err);
                    }, ms);
                };
                scheduleTimeout(timeoutMs);

                const stepCheckBuffer = () => {
                    const normAll = normalizeText(__rxBuf);
                    if (normAll.includes('hand detected')) scheduleTimeout(30000);

                    if (normAll.includes('error:')) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        const msg = (__rxBuf.split(/\r?\n/).find((l) => /error:/i.test(l)) || '').replace(
                            /.*error:\s*/i,
                            '',
                        );
                        if (!silent) {
                            abortProcessNow(`기기 오류: ${msg || '알 수 없는 오류'}`);
                        }
                        reject(new Error(msg || 'Arduino reported ERROR'));
                        return true;
                    }
                    if (normalizeText(__rxBuf).includes(normalizeText(targetMessage))) {
                        const idx = normalizeText(__rxBuf).indexOf(normalizeText(targetMessage));
                        __rxBuf = __rxBuf.slice(idx + targetMessage.length);
                        try {
                            clearTimeout(timer);
                        } catch {}
                        resolve();
                        return true;
                    }
                    return false;
                };

                const loop = async () => {
                    try {
                        if (stepCheckBuffer()) return;

                        const { value, done } = await reader.read();
                        if (done) {
                            try {
                                clearTimeout(timer);
                            } catch {}
                            reject(new Error('Reader stream closed unexpectedly.'));
                            return;
                        }
                        if (value) {
                            __rxBuf += value;
                            if (normalizeText(__rxBuf).includes('hand detected')) scheduleTimeout(30000);
                        }
                        loop();
                    } catch (error) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        console.error('Error in waitForArduinoResponse loop:', error);
                        if (!silent) {
                            if (!handleDeviceLost(error)) {
                                abortProcessNow('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
                            }
                        }
                        reject(error);
                    }
                };
                loop();
            }),
    );
}

// 페트병 끼임 감지 함수 : Sensor2 became LOW를 기다리면서 jam the pet bottle 메시지도 감지
// jam 감지 시 jam-screen 표시 후 닫기 버튼 누르면 프로세스 재개
function waitForSensor2WithJamDetection({ timeoutMs = 30000 } = {}) {
    return withReadLock(
        () =>
            new Promise((resolve, reject) => {
                let timer;
                let jamHandled = false;
                // [NEW] JAM 발생 시 문 열기 명령 후 ACK 대기용 상태
                let jamOpenSent = false;
                let jamOpenSentTime = 0;

                const scheduleTimeout = (ms) => {
                    try {
                        clearTimeout(timer);
                    } catch {}
                    timer = setTimeout(() => {
                        const err = new Error('Motor malfunction timeout');
                        abortProcessNow(`기기 오류: 모터 오작동(${Math.round(ms / 1000)}초 내 완료 신호 없음)`);
                        reject(err);
                    }, ms);
                };
                scheduleTimeout(timeoutMs);

                const showJamScreen = () => {
                    const jamScreenEl = document.getElementById('jam-screen');
                    if (!jamScreenEl) return;

                    // jam screen 내용 생성
                    jamScreenEl.innerHTML = `
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%;">
                            <div style="margin-bottom:24px;">
                                <img src="${ICONS.jam}" alt="jam" width="120" height="120"/>
                            </div>
                            <div style="font-size:2.2rem; font-weight:bold; color:#ff6b6b; margin-bottom:20px; text-align:center; line-height:1.5;">
                                페트병이 끼였습니다!<br>
                                페트병을 더 깊게 넣어주세요.<br>
                                페트병이 이미 깊숙하게 들어가있거나 없을 경우<br>
                                기기 문제이므로 페트병을 빼신 후 메인으로 버튼을 눌러주세요.<br>
                                이 버튼을 누르실 경우 기기는 준비중으로 전환됩니다.
                            </div>
                            <div style="font-size:1.4rem; color:#dbe6ff; margin-bottom:32px; text-align:center;">
                                페트병을 넣은 후 아래 닫기 버튼을 눌러주세요.
                            </div>
                            <button id="jam-close-button" style="font-size:1.5rem; padding:16px 48px; background:#3772ff; color:#fff; border:none; border-radius:10px; cursor:pointer;">
                                닫기
                            </button>
                            <button id="motor-error-button" style="font-size: 1.5rem; padding:16px 48px; background:#ff4d4d; color:#fff; border:none; border-radius:10px; cursor:pointer; margin-top:16px;">
                                메인으로(기기 장애)
                            </button>
                        </div>
                    `;

                    // TTS 음성 안내
                    speakText('페트병이 끼였습니다. 페트병을 더 깊게 넣어주세요.');

                    // 화면 전환
                    document.querySelectorAll('.screen').forEach((s) => (s.style.display = 'none'));
                    jamScreenEl.style.display = 'flex';

                    // 닫기 버튼 클릭 핸들러
                    const jamCloseBtn = document.getElementById('jam-close-button');
                    if (jamCloseBtn) {
                        jamCloseBtn.onclick = async () => {
                            // process-screen으로 복귀
                            document.querySelectorAll('.screen').forEach((s) => (s.style.display = 'none'));
                            document.getElementById('process-screen').style.display = 'flex';

                            // 현재 withReadLock을 해제하기 위해 reject로 탈출
                            // 그 후 별도로 프로세스 재개
                            try {
                                clearTimeout(timer);
                            } catch {}

                            // 특별한 에러로 reject하여 lock 해제
                            reject({ __jamRecovery: true });
                        };
                    }
                    const motorErrorBtn = document.getElementById('motor-error-button');
                    if (motorErrorBtn) {
                        motorErrorBtn.onclick = async () => {
                            // 문 닫고 메인 화면으로 복귀
                            // [DEADLOCK FIX] 여기서는 DO NOT send command. Release lock first.
                            try {
                                clearTimeout(timer);
                            } catch {}
                            reject({ __jamRecovery: false, __forceMain: true });
                        };
                    }
                };
                // 끼임 감지 시 문 열기 명령 전송
                const sendOpenDoorForJam = async () => {
                    try {
                        // 현재 readLock이 걸려있으므로 ACK 대기 없이 명령만 전송
                        await writeCmd('DOOR_OPEN_SIMPLE');
                    } catch (err) {
                        console.error('끼임 시 문 열기 명령 전송 실패:', err);
                    }
                };

                const stepCheckBuffer = () => {
                    const normAll = normalizeText(__rxBuf);

                    // 손 감지 시 타임아웃 연장
                    if (normAll.includes('hand detected')) scheduleTimeout(30000);

                    // [ACK Check] 문 열기 명령 후 응답 대기 상태 처리
                    if (jamOpenSent) {
                        if (normAll.includes('ack:door_open_simple')) {
                            const idx = normAll.indexOf('ack:door_open_simple');
                            try {
                                __rxBuf = __rxBuf.slice(idx + 'ack:door_open_simple'.length);
                            } catch {}
                            showJamScreen();
                            return true;
                        }
                        if (Date.now() - jamOpenSentTime > 2000) {
                            console.warn('Jam Open Door ACK timeout - showing screen anyway');
                            showJamScreen();
                            return true;
                        }
                        return false;
                    }

                    // 에러 감지
                    if (normAll.includes('error:')) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        const msg = (__rxBuf.split(/\r?\n/).find((l) => /error:/i.test(l)) || '').replace(
                            /.*error:\s*/i,
                            '',
                        );
                        abortProcessNow(`기기 오류: ${msg || '알 수 없는 오류'}`);
                        reject(new Error(msg || 'Arduino reported ERROR'));
                        return true;
                    }

                    // 페트병 끼임 감지
                    if (normAll.includes('jam detected') && !jamHandled) {
                        jamHandled = true; // 끼임 처리 플래그 설정 (중복 처리 방지)

                        // 버퍼에서 jam 메시지 제거
                        const lowerBuf = __rxBuf.toLowerCase();
                        const idx = lowerBuf.indexOf('jam detected');
                        if (idx !== -1) {
                            __rxBuf = __rxBuf.slice(idx + 'jam detected'.length);
                        }

                        // 타임아웃 정지
                        try {
                            clearTimeout(timer);
                        } catch {}

                        // 투입구 열기 명령 전송
                        sendOpenDoorForJam();

                        // ACK 대기 모드 진입
                        jamOpenSent = true;
                        jamOpenSentTime = Date.now();
                        return false; // 루프 계속
                    }

                    // 정상 완료 감지
                    if (normAll.includes('sensor2 reached (low)')) {
                        const idx = normAll.indexOf('sensor2 reached (low)');
                        __rxBuf = __rxBuf.slice(idx + 'sensor2 reached (low)'.length);
                        try {
                            clearTimeout(timer);
                        } catch {}
                        resolve();
                        return true;
                    }

                    return false;
                };

                const loop = async () => {
                    try {
                        if (stepCheckBuffer()) return;

                        const { value, done } = await reader.read();
                        if (done) {
                            try {
                                clearTimeout(timer);
                            } catch {}
                            reject(new Error('Reader stream closed unexpectedly.'));
                            return;
                        }
                        if (value) {
                            __rxBuf += value;
                            if (normalizeText(__rxBuf).includes('hand detected')) scheduleTimeout(30000);
                        }
                        loop();
                    } catch (error) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        console.error('Error in waitForSensor2WithJamDetection loop:', error);
                        if (!handleDeviceLost(error)) {
                            abortProcessNow('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
                        }
                        reject(error);
                    }
                };
                loop();
            }),
    );
}

function waitForAnyArduinoResponse(targetMessages, { timeoutMs = 30000 } = {}) {
    const normalizedTargets = targetMessages.map((m) => normalizeText(m));
    return withReadLock(
        () =>
            new Promise((resolve, reject) => {
                let timer;
                const scheduleTimeout = (ms) => {
                    try {
                        clearTimeout(timer);
                    } catch {}
                    timer = setTimeout(() => {
                        console.warn('waitForAnyArduinoResponse timeout', { targetMessages });
                        reject(new Error('Timeout while waiting for Arduino response'));
                    }, ms);
                };
                scheduleTimeout(timeoutMs);

                const stepCheckBuffer = () => {
                    const rawAll = __rxBuf || '';
                    const normAll = normalizeText(rawAll);

                    // 손 감지 시 타임아웃 연장
                    if (normAll.includes('hand detected') || normAll.includes('\n23') || normAll.endsWith('23')) {
                        scheduleTimeout(30000);
                        __handDetectSuppressUntil = Date.now() + 8000; // 8초 동안 already 무시

                        // 손 감지 신호까지 버퍼 소비
                        let key = '';
                        if (normAll.includes('hand detected')) key = 'hand detected';
                        else if (normAll.includes('\n23')) key = '\n23';
                        else key = '23';
                        const idx = normAll.indexOf(key);
                        if (idx !== -1) {
                            __rxBuf = rawAll.slice(idx + key.length);
                        }

                        // "already/sensor state" 노이즈 제거
                        __rxBuf = __filterOutAlreadyAndSensorStateLines(__rxBuf);
                    }

                    if (normAll.includes('error:')) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        const line = rawAll.split(/\r?\n/).find((l) => /error:/i.test(l)) || '기기 오류';
                        showErrorScreen(line.replace(/.*error:\s*/i, '기기 오류: '));
                        reject(new Error('Arduino reported ERROR'));
                        return true;
                    }

                    // already + sensor 상태 오류 처리
                    const suppressAlready = Date.now() < __handDetectSuppressUntil;
                    if (normAll.includes('already') && normAll.includes('sensor')) {
                        if (suppressAlready) {
                            // 무시 모드일 경우 라인 제거
                            __rxBuf = __filterOutAlreadyAndSensorStateLines(rawAll);
                            return false;
                        } else {
                            try {
                                clearTimeout(timer);
                            } catch {}
                            reject(new Error('Sensor state error (already)'));
                            return true;
                        }
                    }

                    for (let i = 0; i < normalizedTargets.length; i++) {
                        const idx = normAll.indexOf(normalizedTargets[i]);
                        if (idx !== -1) {
                            // 메세지 탐지
                            __rxBuf = rawAll.slice(idx + targetMessages[i].length);
                            try {
                                clearTimeout(timer);
                            } catch {}
                            resolve(targetMessages[i]);
                            return true;
                        }
                    }
                    return false;
                };

                const loop = async () => {
                    try {
                        if (stepCheckBuffer()) return;

                        const { value, done } = await reader.read();
                        if (done) {
                            try {
                                clearTimeout(timer);
                            } catch {}
                            reject(new Error('Reader stream closed unexpectedly.'));
                            return;
                        }
                        if (value) {
                            __rxBuf += value;
                        }
                        loop();
                    } catch (error) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        console.error('Error in waitForAnyArduinoResponse loop:', error);
                        if (!handleDeviceLost(error)) {
                            // 기기 연결 끊김 처리
                        }
                        reject(error);
                    }
                };
                loop();
            }),
    );
}

function waitForCloseOrHand(targetMessage, { timeoutMs = 10000 } = {}) {
    return withReadLock(
        () =>
            new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    abortProcessNow('기기 오류: 모터 오작동(10초 내 완료 신호 없음)');
                    reject(new Error('Motor malfunction timeout'));
                }, timeoutMs);

                const stepCheckBuffer = () => {
                    const rawAll = __rxBuf || '';
                    const normAll = normalizeText(rawAll);

                    // 1) 손 감지
                    if (normAll.includes('hand detected') || normAll.includes('\n23') || normAll.endsWith('23')) {
                        // 손 감지 신호까지 버퍼 소비
                        const key = normAll.includes('hand detected') ? 'hand detected' : '23';
                        const idx = normAll.indexOf(key);
                        if (idx !== -1) __rxBuf = rawAll.slice(idx + key.length);

                        __handDetectSuppressUntil = Date.now() + 8000; // 8초 동안 already 무시
                        // "already/sensor state" 노이즈 제거
                        __rxBuf = __filterOutAlreadyAndSensorStateLines(__rxBuf);

                        try {
                            clearTimeout(timer);
                        } catch {}
                        renderProcess('hand', '손이 감지되었습니다. 문이 열립니다.', 1);
                        resolve({ status: 'hand' });
                        return true;
                    }

                    // 2) Real errors
                    if (normAll.includes('error:')) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        const msg = (__rxBuf.split(/\r?\n/).find((l) => /error:/i.test(l)) || '').replace(
                            /.*error:\s*/i,
                            '',
                        );
                        abortProcessNow(`기기 오류: ${msg || '알 수 없는 오류'}`);
                        reject(new Error(msg || 'Arduino reported ERROR'));
                        return true;
                    }

                    // 3) already + sensor 상태 오류 처리
                    const suppressAlready = Date.now() < __handDetectSuppressUntil;
                    if (normAll.includes('already') && normAll.includes('sensor')) {
                        if (suppressAlready) {
                            __rxBuf = __filterOutAlreadyAndSensorStateLines(rawAll);
                            return false;
                        } else {
                            try {
                                clearTimeout(timer);
                            } catch {}
                            reject(new Error('Sensor state error (already)'));
                            return true;
                        }
                    }

                    // 4) 목표 메세지 탐지
                    const nTarget = normalizeText(targetMessage);
                    const idx2 = normAll.indexOf(nTarget);
                    if (idx2 !== -1) {
                        __rxBuf = __rxBuf.slice(idx2 + targetMessage.length);
                        try {
                            clearTimeout(timer);
                        } catch {}
                        resolve({ status: 'ok' });
                        return true;
                    }
                    return false;
                };

                const loop = async () => {
                    try {
                        if (stepCheckBuffer()) return;

                        const { value, done } = await reader.read();
                        if (done) {
                            try {
                                clearTimeout(timer);
                            } catch {}
                            reject(new Error('Reader stream closed unexpectedly.'));
                            return;
                        }
                        if (value) {
                            __rxBuf += value;
                        }
                        loop();
                    } catch (error) {
                        try {
                            clearTimeout(timer);
                        } catch {}
                        console.error('Error in waitForCloseOrHand loop:', error);
                        if (!handleDeviceLost(error)) {
                            abortProcessNow('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
                        }
                        reject(error);
                    }
                };
                loop();
            }),
    );
}

// 2단계(문 닫기) 중 손 감지/완료 대기
// function waitForCloseOrHand(targetMessage, { timeoutMs = 10000 } = {}) {
//     return withReadLock(
//         () =>
//             new Promise((resolve, reject) => {
//                 const timer = setTimeout(() => {
//                     abortProcessNow('기기 오류: 모터 오작동(10초 내 완료 신호 없음)');
//                     reject(new Error('Motor malfunction timeout'));
//                 }, timeoutMs);

//                 const stepCheckBuffer = () => {
//                     const normAll = normalizeText(__rxBuf);
//                     if (normAll.includes('error:')) {
//                         try { clearTimeout(timer); } catch {}
//                         const msg = (__rxBuf.split(/\r?\n/).find((l) => /error:/i.test(l)) || '').replace(/.*error:\s*/i, '');
//                         abortProcessNow(`기기 오류: ${msg || '알 수 없는 오류'}`);
//                         reject(new Error(msg || 'Arduino reported ERROR'));
//                         return true;
//                     }
//                     if (normAll.includes('already') && normAll.includes('sensor')) {
//                         try { clearTimeout(timer); } catch {}
//                         reject(new Error('Sensor state error (already)'));
//                         return true;
//                     }
//                     if (normAll.includes('hand detected') || normAll.includes('\n23') || normAll.endsWith('23')) {
//                         // consume up to 'hand detected' if present
//                         const key = normAll.includes('hand detected') ? 'hand detected' : '23';
//                         const idx = normAll.indexOf(key);
//                         if (idx !== -1) __rxBuf = __rxBuf.slice(idx + key.length);
//                         try { clearTimeout(timer); } catch {}
//                         renderProcess('hand', '손이 감지되었습니다. 문이 열립니다.', 1);
//                         resolve({ status: 'hand' });
//                         return true;
//                     }
//                     const nTarget = normalizeText(targetMessage);
//                     const idx2 = normAll.indexOf(nTarget);
//                     if (idx2 !== -1) {
//                         __rxBuf = __rxBuf.slice(idx2 + targetMessage.length);
//                         try { clearTimeout(timer); } catch {}
//                         resolve({ status: 'ok' });
//                         return true;
//                     }
//                     return false;
//                 };

//                 const loop = async () => {
//                     try {
//                         if (stepCheckBuffer()) return;

//                         const { value, done } = await reader.read();
//                         if (done) {
//                             try { clearTimeout(timer); } catch {}
//                             reject(new Error('Reader stream closed unexpectedly.'));
//                             return;
//                         }
//                         if (value) {
//                             __rxBuf += value;
//                         }
//                         loop();
//                     } catch (error) {
//                         try { clearTimeout(timer); } catch {}
//                         console.error('Error in waitForCloseOrHand loop:', error);
//                         if (!handleDeviceLost(error)) {
//                             abortProcessNow('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
//                         }
//                         reject(error);
//                     }
//                 };
//                 loop();
//             })
//     );
// }

// 2단계 닫힘 중 손 감지 시 다시 열었다가 재시도 후 이어서 진행
async function runCloseClassifyCollectSequence() {
    // 2. 닫힘
    renderCloseDoorOriginal('문이 닫힙니다. 손 조심하세요! ⚠️');
    await writeCmdWithAck('DOOR_CLOSE');
    const closeResult = await waitForCloseOrHand('Door closed successfully!');
    if (closeResult.status === 'hand') {
        // 다시 열기
        await writeCmdWithAck('DOOR_OPEN');
        await waitForArduinoResponse('Door opened.');

        // 재닫기 안내
        renderCloseDoorOriginal('문이 다시 닫힙니다. 손을 치워주세요. ⚠️');
        await writeCmdWithAck('DOOR_CLOSE');
        await waitForArduinoResponse('Door closed successfully!');
    }

    // 3. 판별중
    renderProcess('scan', '자원을 판별하는 중입니다...', 2);
    await writeCmdWithAck('LED_TEST');
    await waitForAnyArduinoResponse(['led blink success'], { timeoutMs: 8000, silent: true });
    await writeCmdWithAck('AI_ZONE_BACK');
    await waitForArduinoResponse('Sensor2 reached (LOW).');
    await new Promise((r) => setTimeout(r, 2000));

    // 4. 수집중
    renderProcess('collect', '자원을 수집하는 중입니다...', 3, { spin: true });
    await writeCmdWithAck('AI_ZONE_FWD');
    await waitForArduinoResponse('Sensor1 reached (LOW).');
    await new Promise((r) => setTimeout(r, 3000));
}

// ========== Fa-duino 연결 ==========
let __serialReadBusy = false;
async function withReadLock(task) {
    while (__serialReadBusy) {
        await new Promise((r) => setTimeout(r, 10));
    }
    __serialReadBusy = true;
    try {
        return await task();
    } finally {
        __serialReadBusy = false;
    }
}

async function connectToFaduino() {
    try {
        if (__testMode) {
            installSimulator();
            return;
        }
        if (!port) {
            const ports = await navigator.serial.getPorts();
            const targetVid = 0x067b;
            const targetPid = 0x23a3;
            port = ports.find((p) => {
                const info = p.getInfo();
                return info.usbVendorId === targetVid && info.usbProductId === targetPid;
            });
            if (!port) {
                port = await navigator.serial.requestPort({
                    filters: [{ usbVendorId: targetVid, usbProductId: targetPid }],
                });
            }
        }

        // 이미 열린 포트라도 reader/writer 없으면 초기화
        if (port.readable || port.writable) {
            if (!reader || !writer) {
                const decoder = new TextDecoderStream();
                port.readable.pipeTo(decoder.writable);
                reader = decoder.readable.getReader();

                const encoder = new TextEncoderStream();
                encoder.readable.pipeTo(port.writable);
                writer = encoder.writable.getWriter();
            }
            isConnected = true;

            // 하드락 중이면 유지보수 해제/상태체크 재개 금지
            const isErrorVisible = document.getElementById('error-screen')?.style.display === 'flex';
            const hardLock = !!(typeof window !== 'undefined' && window.__hardLock);
            if (window && !isErrorVisible && !hardLock) {
                window.__maintenanceMode = false;
                if (window.startPeriodicStatusCheck) {
                    window.startPeriodicStatusCheck();
                }
            }
            const arduinoStatus = document.getElementById('arduino-status');
            const machineStatus = document.getElementById('machine-status');
            if (arduinoStatus) {
                arduinoStatus.textContent = '정상';
                arduinoStatus.style.color = '#00ff4c';
            }
            updateMachineStatusDisplay();
            const isMainVisible = document.getElementById('main-screen')?.style.display === 'flex';
            const inMaintenance = !!(window && window.__maintenanceMode);
            if (isMainVisible) updateLoginButtonByStatus();
            return;
        }

        await port.open({ baudRate: 9600 });

        const decoder = new TextDecoderStream();
        port.readable.pipeTo(decoder.writable);
        reader = decoder.readable.getReader();

        const encoder = new TextEncoderStream();
        encoder.readable.pipeTo(port.writable);
        writer = encoder.writable.getWriter();

        isConnected = true;

        // 하드락 중이면 유지보수 해제/상태체크 재개 금지
        const isErrorVisible = document.getElementById('error-screen')?.style.display === 'flex';
        const hardLock = !!(typeof window !== 'undefined' && window.__hardLock);
        if (window && !isErrorVisible && !hardLock) {
            window.__maintenanceMode = false;
            if (window.startPeriodicStatusCheck) {
                window.startPeriodicStatusCheck();
            }
        }

        const arduinoStatus = document.getElementById('arduino-status');
        const machineStatus = document.getElementById('machine-status');
        if (arduinoStatus) {
            arduinoStatus.textContent = '정상';
            arduinoStatus.style.color = '#00ff4c';
        }
        updateMachineStatusDisplay();
        const isMainVisible = document.getElementById('main-screen')?.style.display === 'flex';
        const inMaintenance = !!(window && window.__maintenanceMode);
        if (isMainVisible) updateLoginButtonByStatus();
    } catch (err) {
        console.error('Serial error:', err);
        isConnected = false;
        showErrorScreen('기기 연결에 실패했습니다. 관리자에게 문의해주세요.');
    }
}

// ========== 페이지 로드 시 개수 표시 및 수거 화면 체크 ==========
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        updateMachineStatusDisplay();

        // 700개 이상이면 바로 수거 화면으로 이동
        const count = getTotalBottleCount();
        if (count >= 700) {
            setTimeout(() => {
                window.location.href = 'collection.html';
            }, 1000);
        }
    });
}

// ========== 이벤트 ==========
loginButton.addEventListener('click', () => {
    phoneNumberInput.value = '';
    if (window.__hardLock) return; // [GUARD]
    loginPopup.style.display = 'flex';
    connectToFaduino();
    // loginPopup 표시 후 1분동안 입력 없을 시 자동 닫기
    setTimeout(() => {
        loginPopup.style.display = 'none';
    }, 1000 * 60);
});

loginSubmit.addEventListener('click', async () => {
    const phone = phoneNumberInput.value;
    if (phone.length !== 13) {
        // 팝업 유지, 간단 안내
        showConfirmModal({
            title: '전화번호 확인',
            lines: ['올바른 전화번호를 입력하세요.', '(예: 010-1234-5678)'],
            yesText: '확인',
            noText: '취소',
            onYes: () => {},
            onNo: () => {},
        });
        return;
    }

    try {
        // 먼저 회원 확인 API 호출
        const member = await callMemberApi(phone);

        // 성공 시 회원명 확인 팝업
        if (member?.status === 'success') {
            const uname = member?.data?.user_name || '';
            showConfirmModal({
                title: '회원 확인',
                lines: [`회원명 : <b>${uname}</b>`, `전화번호 : <b>${phone}</b>`, `<b>${uname}</b> 님이 맞으십니까?`],
                yesText: '예',
                noText: '아니오',
                onYes: async () => {
                    // 기존 시작 로직 수행
                    loginPopup.style.display = 'none';
                    currentPhoneNumber = phone;
                    depositCount = 0;

                    try {
                        if (!isConnected) {
                            await connectToFaduino();
                        }
                        if (!isConnected) {
                            abortProcessNow('기기 연결이 필요합니다. 관리자에게 문의해주세요.');
                            return;
                        }
                        await writeCmd('LOGIN_USER'); // 로그인
                        await new Promise((r) => setTimeout(r, 800));
                        isStopped = false;
                        //stopButton.disabled = false;
                        await startProcess();
                    } catch (e) {
                        console.error('로그인/시작 처리 오류:', e);
                        abortProcessNow('장치에 명령을 전송하지 못했습니다. 관리자에게 문의해주세요.');
                    }
                },
                onNo: () => {
                    // 번호 재입력 유도 (팝업 유지)
                },
            });
            return;
        }

        // FAIL 이거나 처음 사용 시 전화번호 재확인 팝업
        const firstUseMsg = 'PETMON에 처음 사용하시는 회원입니다. 전화번호를 확인하기 위해 한번더 입력 부탁드립니다';
        if (member?.status === 'FAIL' && String(member?.message || '').includes('처음 사용')) {
            showConfirmModal({
                title: '전화번호 확인',
                lines: [`입력하신 전화번호: <b>${phone}</b>`, '이 전화번호가 맞습니까?'],
                yesText: '예',
                noText: '아니오',
                onYes: async () => {
                    // 신규 회원도 동일하게 시작
                    loginPopup.style.display = 'none';
                    currentPhoneNumber = phone;
                    depositCount = 0;

                    try {
                        if (!isConnected) {
                            await connectToFaduino();
                        }
                        if (!isConnected) {
                            abortProcessNow('기기 연결이 필요합니다. 관리자에게 문의해주세요.');
                            return;
                        }
                        await writeCmd('LOGIN_USER');
                        await new Promise((r) => setTimeout(r, 800));
                        isStopped = false;
                        stopButton.disabled = false;
                        await startProcess();
                    } catch (e) {
                        console.error('로그인/시작 처리 오류:', e);
                        abortProcessNow('장치에 명령을 전송하지 못했습니다. 관리자에게 문의해주세요.');
                    }
                },
                onNo: () => {
                    // 번호 재입력 유도 (팝업 유지)
                },
            });
            return;
        }

        // 그 외 FAIL/예외 메시지
        showConfirmModal({
            title: '회원 확인 실패',
            lines: [String(member?.message || '회원 확인 중 오류가 발생했습니다.')],
            yesText: '확인',
            noText: '닫기',
            onYes: () => {},
            onNo: () => {},
        });
    } catch (e) {
        console.error('회원 확인 중 오류:', e);
        showConfirmModal({
            title: '오류',
            lines: ['회원 확인 중 오류가 발생했습니다.', String(e?.message || e)],
            yesText: '확인',
            noText: '닫기',
            onYes: () => {},
            onNo: () => {},
        });
    }
});

keypad.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') return;
    const key = e.target.textContent;
    let val = phoneNumberInput.value.replace(/-/g, '');
    if (key === '←') val = val.slice(0, -1);
    else if (key === 'C') val = '';
    else if (!isNaN(key) && val.length < 11) val += key;

    let formatted = '';
    if (val.length > 0) formatted += val.substring(0, 3);
    if (val.length >= 4) formatted += '-' + val.substring(3, 7);
    if (val.length >= 8) formatted += '-' + val.substring(7, 11);
    phoneNumberInput.value = formatted;
});

phoneNumberInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/-/g, '');
    let f = '';
    if (v.length > 0) f += v.substring(0, 3);
    if (v.length >= 4) f += '-' + v.substring(3, 7);
    if (v.length >= 8) f += '-' + v.substring(7, 11);
    e.target.value = f;
});

// stopButton.addEventListener('click', async () => {
//     isStopped = true;
//     stopButton.disabled = true;
//     try {
//         clearInterval(__closeBtnUnlockTimer);
//         __closeBtnUnlockTimer = null;
//     } catch {}

//     // 1번만 끝난 상태에서 중지 시 닫힘 버튼 클릭 로직 자동 실행
//     if (!closeDoorButton.disabled && closeDoorButton.parentNode) {
//         try {
//             closeDoorButton.disabled = true;
//             closeDoorButton.style = CLOSE_BTN_DISABLED_STYLE;
//             if (closeDoorButton.parentNode) closeDoorButton.parentNode.removeChild(closeDoorButton);

//             const commands = [
//                 { cmd: '2', msg: '문이 닫힙니다. 손 조심하세요! ⚠️' },
//                 { cmd: '3', msg: '자원을 판별하는 중입니다...' },
//                 { cmd: '4', msg: '자원을 수집하는 중입니다...' },
//             ];
//             for (let i = 0; i < commands.length; i++) {
//                 if (i === 0) {
//                     renderCloseDoorOriginal(commands[i].msg);
//                 } else if (i === 1) {
//                     renderProcess('scan', commands[i].msg, 2);
//                 } else {
//                     renderProcess('collect', commands[i].msg, 3, { spin: true });
//                 }

//                 await writeCmd(commands[i].cmd);
//                 await new Promise((r) => setTimeout(r, 50));

//                 if (commands[i].cmd === '3') {
//                     await waitForArduinoResponse('Sensor2 became LOW.');
//                 } else if (commands[i].cmd === '4') {
//                     await waitForArduinoResponse('Sensor1 became LOW.');
//                 } else {
//                     // [CHG] 닫힘 완료 신호 보강 + 여유 타임아웃
//                     await waitForDoorClosed({ timeoutMs: 20000 });
//                 }
//             }
//             showScreen('main-screen');
//         } catch (err) {
//             if (handleDeviceLost(err)) return;
//             console.error('중지 처리 중 오류:', err);
//             showErrorScreen('기기 오류가 발생했습니다. 관리자에게 문의해주세요.');
//         }
//     }
// });

returnHomeButton.addEventListener('click', () => {
    // console.log('Return Home button clicked'); // 디버깅 로그 추가
    clearTimeout(autoReturnTimeout);
    clearInterval(countdownInterval);
    // console.log('Navigating to main screen'); // 디버깅 로그 추가
    showScreen('main-screen');
});
addMoreButton.addEventListener('click', async () => {
    // console.log('Add More button clicked'); // 디버깅 로그 추가
    clearTimeout(autoReturnTimeout); // 기존 타임아웃 취소
    autoReturnTimeout = null; // 변수 초기화
    clearInterval(countdownInterval); // 카운트다운 초기화

    // 추가 투입 시 상태 초기화 후 처음부터 다시 시작
    isStopped = false;
    stopButton.disabled = false;

    // 띠 분리기 상태 초기화 (BELTCutterDone을 false로)
    try {
        await writeCmdWithAck('BELT_CUT');
    } catch (e) {
        console.error('띠 분리기 초기화 실패:', e);
    }

    await startProcess();
});

// 회전 애니메이션 CSS 추가
if (!document.getElementById('spin-style')) {
    const style = document.createElement('style');
    style.id = 'spin-style';
    style.innerHTML = `
   
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        100% { transform: rotate(360deg);}
    }
    `;
    document.head.appendChild(style);
}

// motorStop 함수 수정
async function motorStop() {
    if (writer) {
        try {
            await writeCmdWithAck('STOP'); // 모터 정지 신호 전송 + ACK 대기
        } catch (e) {
            console.error('모터 정지 신호 전송 실패:', e);
        }
    } else {
        console.error('Writer가 초기화되지 않았습니다. 모터 정지 신호를 보낼 수 없습니다.');
    }
}

// 로그인 팝업 닫기 버튼
const keypadCloseButton = document.createElement('button');
keypadCloseButton.textContent = 'X';
keypadCloseButton.style =
    'position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #fff;';
keypadCloseButton.onclick = () => {
    loginPopup.style.display = 'none';

    try {
        clearInterval(__closeBtnUnlockTimer);
        __closeBtnUnlockTimer = null;
    } catch {}
};
keypad.parentNode.style.position = 'relative';
keypad.parentNode.appendChild(keypadCloseButton);

// 시작 버튼 상태를 장비/점검 상태에 맞춰 갱신
function updateLoginButtonByStatus() {
    if (!loginButton) return;
    const inMaintenance = !!(window && window.__maintenanceMode);
    const hardLock = !!(window && window.__hardLock);
    if (inMaintenance || hardLock) {
        loginButton.disabled = true;
        loginButton.textContent = '고객센터 : 1644-1224';
        loginButton.style.display = 'inline-block';
        return;
    }
    if (isConnected) {
        loginButton.disabled = false;
        loginButton.textContent = '시작하기';
        loginButton.style.display = 'inline-block';
    } else {
        loginButton.disabled = true;
        loginButton.textContent = '연결 대기중';
        loginButton.style.display = 'inline-block';
    }
}

// [NEW] 페이지 로드 시 자동 새로고침 (최초 1회만)
if (typeof window !== 'undefined') {
    // sessionStorage로 새로고침 루프 방지
    const hasReloaded = sessionStorage.getItem('petmon.hasReloaded');

    if (!hasReloaded) {
        sessionStorage.setItem('petmon.hasReloaded', '1');

        // 페이지 로드 완료 후 즉시 새로고침
        // window.addEventListener('load', () => {
        //     setTimeout(() => {
        //         window.location.reload();
        //     }, 500);
        // });
    }

    // 메인 화면 표시 시 세션 플래그 제거 (다음 방문을 위해)
    const observer = new MutationObserver(() => {
        const mainScreen = document.getElementById('main-screen');
        if (mainScreen && mainScreen.style.display === 'flex') {
            sessionStorage.removeItem('petmon.hasReloaded');
        }
    });

    // DOM 변화 감지
    if (document.body) {
        observer.observe(document.body, {
            attributes: true,
            subtree: true,
            attributeFilter: ['style'],
        });
    }

    // 이전 세션에서 플래그된 경우: 자동으로 포트를 열어 'X' 전송 (사용자 입력 없이, 기존 권한만 사용)
    (async () => {
        try {
            if (sessionStorage.getItem('petmon.stopOnReload') === '1') {
                sessionStorage.removeItem('petmon.stopOnReload');

                if ('serial' in navigator) {
                    const ports = await navigator.serial.getPorts(); // 이전에 허용된 포트만 반환
                    let chosen = null;
                    if (ports && ports.length) {
                        try {
                            chosen =
                                ports.find((p) => {
                                    try {
                                        return matchesPreferred(p);
                                    } catch {
                                        return false;
                                    }
                                }) || ports[0];
                        } catch {
                            chosen = ports[0];
                        }
                    }
                    if (chosen) {
                        port = chosen;
                        if (!port.readable && !port.writable) {
                            await port.open({ baudRate: 9600 });
                        }
                        const decoder = new TextDecoderStream();
                        port.readable.pipeTo(decoder.writable);
                        reader = decoder.readable.getReader();

                        const encoder = new TextEncoderStream();
                        encoder.readable.pipeTo(port.writable);
                        writer = encoder.writable.getWriter();

                        isConnected = true;

                        try {
                            await writeCmdWithAck('STOP');
                        } catch (e) {
                            console.error('Auto X on reload failed to write:', e);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Auto-stop on reload init failed:', e);
        }
    })();

    // 전역 런타임 에러 핸들링
    window.addEventListener('error', (ev) => {
        try {
            const msg = ev?.message || 'unknown error';
            const src = ev?.filename || '';
            const ln = ev?.lineno != null ? `:${ev.lineno}` : '';
            const cn = ev?.colno != null ? `:${ev.colno}` : '';
            const errTxt = __errorToText(ev?.error || msg);
            appendErrorLog(`[${nowTs()}] WINDOW_ERROR ${src}${ln}${cn} ${errTxt}`);
        } catch {}
    });
    // 초기 지점명 로드
    loadDeviceConfig();
    // 포인트 로그 내보내기: Ctrl+Alt+L
    window.addEventListener('keydown', async (e) => {
        // Ctrl+Alt+I: 로컬 ini 파일 선택해서 적용
        if (e.ctrlKey && e.altKey && (e.key === 'i' || e.key === 'I')) {
            try {
                await pickAndLoadIni();
            } catch (err) {
                console.debug('INI 선택 중 오류(무시 가능):', err);
            }
            return;
        }
        // Ctrl+Alt+C: 띠 분리기 단계 완전 스킵 (바로 투입구 열기)
        if (e.ctrlKey && e.altKey && (e.key === 'c' || e.key === 'C')) {
            try {
                if (writer && isConnected) {
                    // 띠 분리기를 완전히 건너뛰고 바로 투입구 열기 명령 전송
                    console.log('띠 분리기 스킵: 바로 투입구 열기 명령 전송');
                    // [MOD] Main Loop가 Read Lock을 잡고 있을 때(띠 분리기 대기 등),
                    // writeCmdWithAck를 쓰면 ACK가 Main Loop에 의해 삼켜질 수 있어 타임아웃 발생함.
                    // 따라서 ACK 체크 없이 명령만 보내고, Main Loop가 'Door opened'를 받아 진행하게 함.
                    await writeCmd('DOOR_OPEN');
                    console.log('투입구 열기 명령 전송 완료');
                } else {
                    console.warn('시리얼 연결이 없어서 띠 분리기 스킵 불가');
                }
            } catch (err) {
                console.error('띠 분리기 스킵 처리 실패:', err);
            }
            return;
        }
        if (e.ctrlKey && e.altKey && (e.key === 'l' || e.key === 'L')) {
            try {
                if (!navigator?.storage?.getDirectory) return alert('로그 파일 시스템 접근을 지원하지 않습니다.');
                const root = await navigator.storage.getDirectory();
                const dir = await root.getDirectoryHandle('petmon');
                const file = await dir.getFileHandle('point_log.txt');
                const blob = await file.getFile();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'point_log.txt';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 0);
            } catch (err) {
                alert('로그 파일이 아직 없습니다. (투입 후 생성됩니다)');
            }
        }
        // Ctrl+Alt+E: 에러 로그 내보내기 (OPFS)
        if (e.ctrlKey && e.altKey && (e.key === 'e' || e.key === 'E')) {
            try {
                if (!navigator?.storage?.getDirectory) return alert('에러 로그 내보내기를 지원하지 않습니다.');
                const root = await navigator.storage.getDirectory();
                const dir1 = await root.getDirectoryHandle('petmon');
                const dir2 = await dir1.getDirectoryHandle('log');
                const fh = await dir2.getFileHandle('errorlog.txt');
                const blob = await fh.getFile();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'errorlog.txt';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 0);
            } catch (err) {
                alert('에러 로그가 아직 없습니다. (오류 발생 시 생성됩니다)');
            }
        }
        // Ctrl+Alt+O: 에러 로그 파일 직접 지정(한 번만 설정하면 지속 사용)
        if (e.ctrlKey && e.altKey && (e.key === 'o' || e.key === 'O')) {
            try {
                await setErrorLogFileManually();
            } catch (err) {
                console.error('에러 로그 파일 지정 실패:', err);
            }
        }
    });
    // 스크립트에서 수동 호출할 수 있도록 노출
    window.setErrorLogFileManually = setErrorLogFileManually;
    // 테스트 모드 토글/오류 트리거 + 관리자 모드 진입
    const toggleBtn = document.getElementById('btn-toggle-test');
    const errBtn = document.getElementById('btn-test-error');
    const skipBtn = document.getElementById('btn-skip-cutter');
    const testControls = document.getElementById('test-controls');
    const adminTrigger = document.getElementById('admin-mode-trigger');

    // 관리자 모드 전에는 숨김 (CSS에서도 기본값을 none으로 설정)
    if (testControls) testControls.style.display = 'none';

    function exitAdminMode() {
        __testMode = false;
        updateTestBadge();
        if (testControls) testControls.style.display = 'none';
        // 관리자 모드 종료 시 세션 제거
        try {
            sessionStorage.removeItem('petmon.adminPinOK');
        } catch {}
    }

    function ensureExitButton() {
        if (!testControls) return;
        let exitBtn = document.getElementById('btn-exit-admin');
        if (!exitBtn) {
            exitBtn = document.createElement('button');
            exitBtn.id = 'btn-exit-admin';
            exitBtn.textContent = '관리자모드 종료';
            exitBtn.style.cssText =
                'font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#e5e7eb;cursor:pointer;';
            exitBtn.addEventListener('click', exitAdminMode);
            testControls.appendChild(exitBtn);
        }

        // 새로고침 버튼
        let refreshBtn = document.getElementById('btn-refresh-page');
        if (!refreshBtn) {
            refreshBtn = document.createElement('button');
            refreshBtn.id = 'btn-refresh-page';
            refreshBtn.textContent = '새로고침';
            refreshBtn.style.cssText =
                'font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#e5e7eb;cursor:pointer;';
            refreshBtn.addEventListener('click', () => {
                window.location.reload();
            });
            testControls.appendChild(refreshBtn);
        }
        let chooseBtn = document.getElementById('btn-choose-serial');
        if (!chooseBtn) {
            chooseBtn = document.createElement('button');
            chooseBtn.id = 'btn-choose-serial';
            chooseBtn.textContent = '포트 선택(목록)';
            chooseBtn.style.cssText =
                'font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #475569;background:#111827;color:#e5e7eb;cursor:pointer;';
            chooseBtn.addEventListener('click', async () => {
                await chooseSerialPort(); // 선택 창 열기
            });
            testControls.appendChild(chooseBtn);
        }
    }

    async function enterAdminMode() {
        try {
            // PIN 요구 (전역 유틸은 index.html에 정의)
            if (window.requireAdminPin) {
                const ok = await window.requireAdminPin();
                if (!ok) return;
                try {
                    sessionStorage.setItem('petmon.adminPinOK', '1');
                } catch {}
            }
        } catch {}
        if (testControls) testControls.style.display = 'flex';
        ensureExitButton();
    }

    // 1초 내 4회 연속 클릭 시 관리자 모드 진입
    if (adminTrigger) {
        let clicks = 0;
        let timer = null;
        adminTrigger.addEventListener('click', () => {
            if (clicks === 0) {
                timer = setTimeout(() => {
                    clicks = 0;
                    timer = null;
                }, 1000);
            }
            clicks++;
            if (clicks >= 4) {
                clicks = 0;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                enterAdminMode();
            }
        });
    }
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            __testMode = !__testMode;
            updateTestBadge();
            if (__testMode) {
                if (!isConnected) installSimulator();
            } else {
                teardownSerial();
            }
        });
    }
    if (errBtn) {
        errBtn.addEventListener('click', () => {
            if (!__testMode) return alert('테스트 모드를 먼저 켜세요.');
            showErrorScreen('테스트: 임의 오류 화면입니다.');
        });
    }
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            if (!__testMode) return alert('테스트 모드를 먼저 켜세요.');
            // 띠 분리기 단계를 건너뛰는 플래그
            simEnqueue('Belt cutting done', 100);
            simEnqueue('Door will open', 200);
            simEnqueue('Door opened.', 400);
        });
    }
    updateTestBadge();
}
// 화살표 표시
function showBottomArrowAt(px) {
    try {
        if (!document.getElementById('bottom-arrow-style')) {
            const style = document.createElement('style');
            style.id = 'bottom-arrow-style';
            style.innerHTML = `
                #bottom-arrow {
                    position: fixed;
                    bottom: 12px;                   
                    pointer-events: none;
                    z-index: 9999;
                    display: block;
                    /* Base transform includes -50% X centering; animation adjusts Y only */
                    transform: translate(-50%, 0);
                    animation: arrow-bob 1.3s ease-in-out infinite;
                }
                #bottom-arrow .shaft {
                    width: 14px;                    /* thicker body */
                    height: 70px;                   /* taller body */
                    background: var(--arrow-color, #3772ff);
                    margin: 0 auto;
                    box-shadow: 0 2px 4px rgba(0,0,0,.35);
                }
                #bottom-arrow .head {
                    width: 0;
                    height: 0;
                    border-left: 22px solid transparent;
                    border-right: 22px solid transparent;
                    border-top: 28px solid var(--arrow-color, #3772ff); /* bigger tip */
                    filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));
                }
                @keyframes arrow-bob {
                    0%, 100% { transform: translate(-50%, 0); }
                    50%      { transform: translate(-50%, -12px); }
                }
            `;
            document.head.appendChild(style);
        }

        let el = document.getElementById('bottom-arrow');
        if (!el) {
            el = document.createElement('div');
            el.id = 'bottom-arrow';
            // tip + body
            el.innerHTML = `
                <div class="shaft"></div>
                <div class="head"></div>
            `;
            document.body.appendChild(el);
        }
        el.style.left = px + 'px';
        el.style.display = 'block';
    } catch {}
}

function hideBottomArrow() {
    try {
        const el = document.getElementById('bottom-arrow');
        if (el) el.style.display = 'none';
    } catch {}
}

// Webcam & OPFS
let webcamStream = null;
let videoElement = document.createElement('video');
videoElement.style.display = 'none';
videoElement.autoplay = true;
videoElement.playsInline = true;
document.body.appendChild(videoElement);

async function initWebcam() {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = webcamStream;
        console.log('Webcam initialized');
    } catch (err) {
        console.error('Webcam initialization failed:', err);
    }
}

// 웹캠 초기화
window.addEventListener('load', initWebcam);

async function savePhotoToOPFS(blob, filename) {
    try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        console.log('Saved to OPFS:', filename);
    } catch (err) {
        console.error('Failed to save to OPFS:', err);
    }
}

async function removePhotoFromOPFS(filename) {
    try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(filename);
        await root.removeEntry(filename);
        console.log('Removed from OPFS:', filename);
    } catch (err) {
        console.error('Failed to remove from OPFS:', err);
    }
}

async function takePhotoAndSave(prefix = '') {
    if (!webcamStream) {
        console.warn('Webcam not available, trying to init...');
        await initWebcam();
        if (!webcamStream) return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    const dateStr = `${yyyy}${mm}${dd}`;
    const timeStr = `${hh}${min}${ss}`;

    // 휴대폰 번호 정리
    let phone = typeof currentPhoneNumber !== 'undefined' && currentPhoneNumber ? currentPhoneNumber : '00000000000';
    phone = phone.replace(/[^0-9]/g, '');
    if (!phone) phone = '00000000000';

    const filename = `${prefix}${dateStr}${timeStr}_${phone}.png`;

    canvas.toBlob(async (blob) => {
        if (blob) {
            await savePhotoToOPFS(blob, filename);
        }
    }, 'image/png');
}

async function downloadAllPhotos() {
    try {
        const root = await navigator.storage.getDirectory();
        let count = 0;
        for await (const [name, handle] of root.entries()) {
            if (name.endsWith('.png')) {
                const file = await handle.getFile();
                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                count++;
                // 브라우저가 여러 다운로드를 차단하지 않도록 작은 지연 추가
                await new Promise((r) => setTimeout(r, 200));
                await removePhotoFromOPFS(name);
            }
        }
        if (count === 0) {
            alert('저장된 사진이 없습니다.');
        }
    } catch (err) {
        console.error('다운로드 실패:', err);
        alert('다운로드 중 오류가 발생했습니다.');
    }
}

document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        downloadAllPhotos();
    }
});
