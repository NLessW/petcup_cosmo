const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { SerialPort } = require('serialport');

// Windows Squirrel 설치 프로그램 이벤트 처리
const handleSquirrelEvent = () => {
    if (process.argv[1] === '--squirrel-install' || process.argv[1] === '--squirrel-updated') {
        // 바로가기 생성
        return true;
    }
    if (process.argv[1] === '--squirrel-uninstall') {
        // 바로가기 제거
        return true;
    }
    if (process.argv[1] === '--squirrel-obsolete') {
        app.quit();
        return true;
    }
    return false;
};

if (handleSquirrelEvent()) {
    app.quit();
}

const PORT_IDS = {
    main: 'A5069RR4A',
    servo: 'AL01QFACA',
};

const BAUD_RATES = {
    main: 9600,
    servo: 57600,
};

const ports = {
    main: null,
    servo: null,
};

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1080, // 세로 모니터 너비 (1920x1080 세로 회전 시)
        height: 1920, // 세로 모니터 높이
        frame: false, // 메뉴바 제거
        fullscreen: true, // 전체화면 모드
        kiosk: true, // 키오스크 모드
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
}

function portMatchesRole(info, role) {
    const id = PORT_IDS[role].toLowerCase();
    const haystack = [info.serialNumber, info.pnpId, info.path, info.friendlyName, info.manufacturer]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(id);
}

async function findPortInfo(role) {
    const list = await SerialPort.list();
    return list.find((info) => portMatchesRole(info, role));
}

function sendData(role, data) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('serial:data', {
        role,
        bytes: Array.from(data),
    });
}

async function closePort(role) {
    const port = ports[role];
    if (!port) return;

    await new Promise((resolve) => {
        if (!port.isOpen) {
            resolve();
            return;
        }
        port.close(() => resolve());
    });

    ports[role] = null;
}

async function connectRole(role) {
    if (ports[role]?.isOpen) {
        return { ok: true, path: ports[role].path, reused: true };
    }

    const info = await findPortInfo(role);
    if (!info) {
        return {
            ok: false,
            error: `${role} port not found (${PORT_IDS[role]})`,
            ports: await SerialPort.list(),
        };
    }

    await closePort(role);

    const port = new SerialPort({
        path: info.path,
        baudRate: BAUD_RATES[role],
        autoOpen: false,
    });

    await new Promise((resolve, reject) => {
        port.open((error) => {
            if (error) reject(error);
            else resolve();
        });
    });

    port.on('data', (data) => sendData(role, data));
    port.on('error', (error) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('serial:data', {
            role,
            error: error.message,
        });
    });

    ports[role] = port;
    return { ok: true, path: info.path, pnpId: info.pnpId, serialNumber: info.serialNumber || null };
}

async function writeRole(role, bytes) {
    const port = ports[role];
    if (!port?.isOpen) {
        return { ok: false, error: `${role} port is not open` };
    }

    const buffer = Buffer.from(bytes);
    await new Promise((resolve, reject) => {
        port.write(buffer, (error) => {
            if (error) {
                reject(error);
                return;
            }
            port.drain((drainError) => {
                if (drainError) reject(drainError);
                else resolve();
            });
        });
    });

    return { ok: true };
}

app.whenReady().then(() => {
    createWindow();

    ipcMain.handle('serial:list', async () => SerialPort.list());
    ipcMain.handle('serial:connect', async (_event, role) => connectRole(role));
    ipcMain.handle('serial:connect-all', async () => {
        const main = await connectRole('main');
        const servo = await connectRole('servo');
        return { ok: main.ok && servo.ok, main, servo };
    });
    ipcMain.handle('serial:write-main', async (_event, bytes) => writeRole('main', bytes));
    ipcMain.handle('serial:write-servo', async (_event, bytes) => writeRole('servo', bytes));

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    app.on('before-quit', async () => {
        await closePort('main');
        await closePort('servo');
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
