// ========================================
// PETMON 자동 분류 시스템 - Modbus RTU
// ========================================

// 메인 컨트롤러 포트 (RS-485 with Modbus RTU)
// VID_0403+PID_6001+A5069RR4A\0000
let mainPort = null;
let mainReader = null;
let mainWriter = null;

// 서보 모터 포트 (Dynamixel)
// VID_0403+PID_6001+AL01QFACA\0000
let servoPort = null;
let servoReader = null;
let servoWriter = null;

// 시스템 상태
let isProcessing = false;
let processStep = 0;
let waitingForConfirmation = false;
let totalSteps = 6;
let currentCupType = 'PET';
let completionTimer = null;
let completionCountdown = 10;

// Modbus RTU 설정
const MODBUS_SLAVE_ID = 1;
const PORT_STORAGE_KEY = 'cupbox.serialPorts.v1';
const USB_SERIAL_FILTERS = [{ usbVendorId: 0x0403, usbProductId: 0x6001 }];

// ========================================
// Modbus RTU Register Map
// ========================================
const ModbusReg = {
    DOOR_CMD: 0x0000,
    DOOR_STATUS: 0x0001,
    PUMP_CTRL: 0x0002,
    DOOR_SPEED_OPEN: 0x0003,
    DOOR_SPEED_CLOSE: 0x0004,
    SENSOR_OPEN: 0x0005,
    SENSOR_CLOSE: 0x0006,
    CUP_PRESS_CTRL: 0x0007,
    CLASSIFY_CTRL: 0x0008,
    CLASSIFY_STATUS: 0x0009,
};

const ModbusFunc = {
    READ_HOLDING_REGISTERS: 0x03,
    WRITE_SINGLE_REGISTER: 0x06,
    WRITE_MULTIPLE_REGISTERS: 0x10,
};

// ========================================
// Modbus RTU CRC-16 계산
// ========================================
function calculateModbusCRC(data) {
    let crc = 0xffff;

    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];

        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc >>= 1;
                crc ^= 0xa001;
            } else {
                crc >>= 1;
            }
        }
    }

    return crc;
}

// ========================================
// Modbus RTU 패킷 생성
// ========================================

// Function 0x03: Read Holding Registers
function buildReadRegistersPacket(startAddr, numRegs) {
    const packet = new Uint8Array(8);
    packet[0] = MODBUS_SLAVE_ID;
    packet[1] = ModbusFunc.READ_HOLDING_REGISTERS;
    packet[2] = (startAddr >> 8) & 0xff;
    packet[3] = startAddr & 0xff;
    packet[4] = (numRegs >> 8) & 0xff;
    packet[5] = numRegs & 0xff;

    const crc = calculateModbusCRC(packet.slice(0, 6));
    packet[6] = crc & 0xff;
    packet[7] = (crc >> 8) & 0xff;

    return packet;
}

// Function 0x06: Write Single Register
function buildWriteSingleRegisterPacket(regAddr, regValue) {
    const packet = new Uint8Array(8);
    packet[0] = MODBUS_SLAVE_ID;
    packet[1] = ModbusFunc.WRITE_SINGLE_REGISTER;
    packet[2] = (regAddr >> 8) & 0xff;
    packet[3] = regAddr & 0xff;
    packet[4] = (regValue >> 8) & 0xff;
    packet[5] = regValue & 0xff;

    const crc = calculateModbusCRC(packet.slice(0, 6));
    packet[6] = crc & 0xff;
    packet[7] = (crc >> 8) & 0xff;

    return packet;
}

// Function 0x10: Write Multiple Registers
function buildWriteMultipleRegistersPacket(startAddr, values) {
    const numRegs = values.length;
    const byteCount = numRegs * 2;
    const packet = new Uint8Array(7 + byteCount + 2);

    packet[0] = MODBUS_SLAVE_ID;
    packet[1] = ModbusFunc.WRITE_MULTIPLE_REGISTERS;
    packet[2] = (startAddr >> 8) & 0xff;
    packet[3] = startAddr & 0xff;
    packet[4] = (numRegs >> 8) & 0xff;
    packet[5] = numRegs & 0xff;
    packet[6] = byteCount;

    for (let i = 0; i < numRegs; i++) {
        packet[7 + i * 2] = (values[i] >> 8) & 0xff;
        packet[8 + i * 2] = values[i] & 0xff;
    }

    const crc = calculateModbusCRC(packet.slice(0, 7 + byteCount));
    packet[7 + byteCount] = crc & 0xff;
    packet[8 + byteCount] = (crc >> 8) & 0xff;

    return packet;
}

// ========================================
// Dynamixel Protocol 2.0 구현
// ========================================

// Control Table 주소 (XL430-W250)
const ADDR_TORQUE_ENABLE = 64;
const ADDR_GOAL_POSITION = 116;

// 명령어
const INST_PING = 0x01;
const INST_WRITE = 0x03;

// CRC 계산 함수
function updateCRC(crc_accum, data_blk) {
    const crc_table = [
        0x0000, 0x8005, 0x800f, 0x000a, 0x801b, 0x001e, 0x0014, 0x8011, 0x8033, 0x0036, 0x003c, 0x8039, 0x0028, 0x802d,
        0x8027, 0x0022, 0x8063, 0x0066, 0x006c, 0x8069, 0x0078, 0x807d, 0x8077, 0x0072, 0x0050, 0x8055, 0x805f, 0x005a,
        0x804b, 0x004e, 0x0044, 0x8041, 0x80c3, 0x00c6, 0x00cc, 0x80c9, 0x00d8, 0x80dd, 0x80d7, 0x00d2, 0x00f0, 0x80f5,
        0x80ff, 0x00fa, 0x80eb, 0x00ee, 0x00e4, 0x80e1, 0x00a0, 0x80a5, 0x80af, 0x00aa, 0x80bb, 0x00be, 0x00b4, 0x80b1,
        0x8093, 0x0096, 0x009c, 0x8099, 0x0088, 0x808d, 0x8087, 0x0082, 0x8183, 0x0186, 0x018c, 0x8189, 0x0198, 0x819d,
        0x8197, 0x0192, 0x01b0, 0x81b5, 0x81bf, 0x01ba, 0x81ab, 0x01ae, 0x01a4, 0x81a1, 0x01e0, 0x81e5, 0x81ef, 0x01ea,
        0x81fb, 0x01fe, 0x01f4, 0x81f1, 0x81d3, 0x01d6, 0x01dc, 0x81d9, 0x01c8, 0x81cd, 0x81c7, 0x01c2, 0x0140, 0x8145,
        0x814f, 0x014a, 0x815b, 0x015e, 0x0154, 0x8151, 0x8173, 0x0176, 0x017c, 0x8179, 0x0168, 0x816d, 0x8167, 0x0162,
        0x8123, 0x0126, 0x012c, 0x8129, 0x0138, 0x813d, 0x8137, 0x0132, 0x0110, 0x8115, 0x811f, 0x011a, 0x810b, 0x010e,
        0x0104, 0x8101, 0x8303, 0x0306, 0x030c, 0x8309, 0x0318, 0x831d, 0x8317, 0x0312, 0x0330, 0x8335, 0x833f, 0x033a,
        0x832b, 0x032e, 0x0324, 0x8321, 0x0360, 0x8365, 0x836f, 0x036a, 0x837b, 0x037e, 0x0374, 0x8371, 0x8353, 0x0356,
        0x035c, 0x8359, 0x0348, 0x834d, 0x8347, 0x0342, 0x03c0, 0x83c5, 0x83cf, 0x03ca, 0x83db, 0x03de, 0x03d4, 0x83d1,
        0x83f3, 0x03f6, 0x03fc, 0x83f9, 0x03e8, 0x83ed, 0x83e7, 0x03e2, 0x83a3, 0x03a6, 0x03ac, 0x83a9, 0x03b8, 0x83bd,
        0x83b7, 0x03b2, 0x0390, 0x8395, 0x839f, 0x039a, 0x838b, 0x038e, 0x0384, 0x8381, 0x0280, 0x8285, 0x828f, 0x028a,
        0x829b, 0x029e, 0x0294, 0x8291, 0x82b3, 0x02b6, 0x02bc, 0x82b9, 0x02a8, 0x82ad, 0x82a7, 0x02a2, 0x82e3, 0x02e6,
        0x02ec, 0x82e9, 0x02f8, 0x82fd, 0x82f7, 0x02f2, 0x02d0, 0x82d5, 0x82df, 0x02da, 0x82cb, 0x02ce, 0x02c4, 0x82c1,
        0x8243, 0x0246, 0x024c, 0x8249, 0x0258, 0x825d, 0x8257, 0x0252, 0x0270, 0x8275, 0x827f, 0x027a, 0x826b, 0x026e,
        0x0264, 0x8261, 0x0220, 0x8225, 0x822f, 0x022a, 0x823b, 0x023e, 0x0234, 0x8231, 0x8213, 0x0216, 0x021c, 0x8219,
        0x0208, 0x820d, 0x8207, 0x0202,
    ];

    for (let j = 0; j < data_blk.length; j++) {
        let i = ((crc_accum >> 8) ^ data_blk[j]) & 0xff;
        crc_accum = ((crc_accum << 8) ^ crc_table[i]) & 0xffff;
    }
    return crc_accum;
}

// Dynamixel 패킷 생성
function makeDynamixelPacket(id, instruction, params) {
    const length = params.length + 3; // instruction(1) + params + CRC(2)

    let packet = [
        0xff,
        0xff,
        0xfd,
        0x00, // Header
        id, // ID
        length & 0xff, // Length Low
        (length >> 8) & 0xff, // Length High
        instruction, // Instruction
    ];

    // Parameters 추가
    packet = packet.concat(params);

    // CRC 계산
    const crc = updateCRC(0, packet);
    packet.push(crc & 0xff); // CRC Low
    packet.push((crc >> 8) & 0xff); // CRC High

    return new Uint8Array(packet);
}

// 토크 활성화/비활성화
function buildTorquePacket(id, enable) {
    return makeDynamixelPacket(id, INST_WRITE, [
        ADDR_TORQUE_ENABLE & 0xff,
        (ADDR_TORQUE_ENABLE >> 8) & 0xff,
        enable ? 1 : 0,
    ]);
}

function buildPingPacket(id) {
    return makeDynamixelPacket(id, INST_PING, []);
}

// 위치 이동
function buildPositionPacket(id, position) {
    return makeDynamixelPacket(id, INST_WRITE, [
        ADDR_GOAL_POSITION & 0xff,
        (ADDR_GOAL_POSITION >> 8) & 0xff,
        position & 0xff,
        (position >> 8) & 0xff,
        (position >> 16) & 0xff,
        (position >> 24) & 0xff,
    ]);
}

// ========================================
// 포트 연결 함수
// ========================================

function getStoredPortConfig() {
    try {
        return JSON.parse(localStorage.getItem(PORT_STORAGE_KEY) || '{}');
    } catch (error) {
        return {};
    }
}

function savePortConfig(role, port) {
    const config = getStoredPortConfig();
    const info = port.getInfo ? port.getInfo() : {};
    config[role] = {
        usbVendorId: info.usbVendorId || null,
        usbProductId: info.usbProductId || null,
        protocol: role === 'main' ? 'modbus-rtu' : 'dynamixel',
        savedAt: Date.now(),
    };
    localStorage.setItem(PORT_STORAGE_KEY, JSON.stringify(config));
}

function hasStoredPortConfig(role) {
    const config = getStoredPortConfig();
    return Boolean(config[role]);
}

function getPortInfoText(port) {
    const info = port.getInfo ? port.getInfo() : {};
    const vendor = info.usbVendorId ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : 'unknown';
    const product = info.usbProductId ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : 'unknown';
    return `${vendor}/${product}`;
}

function getUnusedSavedPort(savedPorts, usedPorts, preferredIndex) {
    const candidates = savedPorts.filter((port) => !usedPorts.includes(port));
    return candidates[preferredIndex] || candidates[0] || null;
}

function concatUint8Arrays(first, second) {
    const combined = new Uint8Array(first.length + second.length);
    combined.set(first);
    combined.set(second, first.length);
    return combined;
}

function hasValidModbusResponse(buffer) {
    for (let offset = 0; offset <= buffer.length - 7; offset++) {
        if (buffer[offset] !== MODBUS_SLAVE_ID || buffer[offset + 1] !== ModbusFunc.READ_HOLDING_REGISTERS) continue;

        const byteCount = buffer[offset + 2];
        const frameLength = 3 + byteCount + 2;
        if (byteCount < 2 || buffer.length - offset < frameLength) continue;

        const frame = buffer.slice(offset, offset + frameLength);
        const receivedCRC = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
        const calculatedCRC = calculateModbusCRC(frame.slice(0, frame.length - 2));
        if (receivedCRC === calculatedCRC) return true;
    }

    return false;
}

function hasDynamixelStatusPacket(buffer) {
    for (let offset = 0; offset <= buffer.length - 11; offset++) {
        const hasHeader =
            buffer[offset] === 0xff &&
            buffer[offset + 1] === 0xff &&
            buffer[offset + 2] === 0xfd &&
            buffer[offset + 3] === 0x00;
        if (!hasHeader) continue;

        const id = buffer[offset + 4];
        const instruction = buffer[offset + 7];
        if ((id === 1 || id === 2) && instruction === 0x55) return true;
    }

    return false;
}

async function readProbeResponse(reader, validator, timeoutMs) {
    let buffer = new Uint8Array(0);
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const remaining = timeoutMs - (Date.now() - startedAt);
        const result = await Promise.race([reader.read(), delay(Math.max(remaining, 1)).then(() => null)]);
        if (!result || result.done) break;

        if (result.value) {
            buffer = concatUint8Arrays(buffer, result.value);
            if (validator(buffer)) return true;
        }
    }

    return false;
}

async function probePort(port, baudRate, packets, validator) {
    let reader = null;
    let writer = null;

    try {
        await port.open({ baudRate });
        reader = port.readable.getReader();
        writer = port.writable.getWriter();

        for (const packet of packets) {
            await writer.write(packet);
            await delay(40);
        }

        return await readProbeResponse(reader, validator, 450);
    } catch (error) {
        return false;
    } finally {
        if (reader) {
            try {
                await reader.cancel();
            } catch (error) {}
            try {
                reader.releaseLock();
            } catch (error) {}
        }

        if (writer) {
            try {
                writer.releaseLock();
            } catch (error) {}
        }

        try {
            await port.close();
        } catch (error) {}
    }
}

async function isMainControllerPort(port) {
    return await probePort(port, 9600, [buildReadRegistersPacket(ModbusReg.DOOR_STATUS, 1)], hasValidModbusResponse);
}

async function isServoControllerPort(port) {
    return await probePort(port, 57600, [buildPingPacket(1), buildPingPacket(2)], hasDynamixelStatusPacket);
}

async function findPortByProtocol(role, usedPorts) {
    const savedPorts = await navigator.serial.getPorts();
    const candidates = savedPorts.filter((port) => !usedPorts.includes(port));
    const probe = role === 'main' ? isMainControllerPort : isServoControllerPort;

    for (const port of candidates) {
        log(`[${role === 'main' ? '메인' : '서보'}] 저장된 포트 확인 중 (${getPortInfoText(port)})`);
        if (await probe(port)) return port;
    }

    return null;
}

async function connectMainController(useSavedPort = true) {
    try {
        const alreadyUsedPorts = [servoPort].filter((p) => p !== null);
        let targetPort = null;

        if (useSavedPort && hasStoredPortConfig('main')) {
            targetPort = await findPortByProtocol('main', alreadyUsedPorts);
            if (targetPort) {
                log(`[메인] 저장된 포트로 자동 연결 시도 (${getPortInfoText(targetPort)})`);
            } else {
                log('[메인] Modbus 응답 포트를 찾지 못했습니다. 포트 선택창을 엽니다.');
            }
        }

        if (!targetPort) {
            log('[메인] Modbus RTU 컨트롤러 포트를 선택해주세요...');
            targetPort = await navigator.serial.requestPort({
                filters: USB_SERIAL_FILTERS,
            });

            if (!(await isMainControllerPort(targetPort))) {
                log('[메인] 선택한 포트에서 Modbus 응답을 확인하지 못했습니다.');
                return false;
            }
        }

        // 이미 사용 중인 포트인지 확인
        if (alreadyUsedPorts.includes(targetPort)) {
            log('[메인] 이미 사용 중인 포트입니다. 다른 포트를 선택해주세요.');
            return false;
        }

        await targetPort.open({ baudRate: 9600 });
        mainPort = targetPort;
        savePortConfig('main', targetPort);

        mainReader = mainPort.readable.getReader();
        mainWriter = mainPort.writable.getWriter();

        log('[메인] Modbus RTU 컨트롤러 연결 성공 (9600 baud)');
        log('[메인] Modbus Slave ID: ' + MODBUS_SLAVE_ID);

        readMainData();
        return true;
    } catch (error) {
        log('[메인] 연결 실패: ' + error.message);
        mainPort = null;
        mainReader = null;
        mainWriter = null;
        return false;
    }
}

async function readMainData() {
    let buffer = new Uint8Array(0);
    try {
        while (true) {
            const { value, done } = await mainReader.read();
            if (done) break;

            // 바이너리 데이터 누적
            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;

            // Modbus 응답 파싱 (간단한 로깅)
            if (buffer.length >= 5) {
                let hexStr = '[메인] RX: ';
                for (let i = 0; i < buffer.length; i++) {
                    hexStr += buffer[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
                }
                log(hexStr);
                buffer = new Uint8Array(0); // 버퍼 초기화
            }
        }
    } catch (error) {
        log('[메인] 수신 오류: ' + error.message);
    }
}

async function connectServoController(useSavedPort = true) {
    try {
        const alreadyUsedPorts = [mainPort].filter((p) => p !== null);
        let targetPort = null;

        if (useSavedPort && hasStoredPortConfig('servo')) {
            targetPort = await findPortByProtocol('servo', alreadyUsedPorts);
            if (targetPort) {
                log(`[서보] 저장된 포트로 자동 연결 시도 (${getPortInfoText(targetPort)})`);
            } else {
                log('[서보] Dynamixel 응답 포트를 찾지 못했습니다. 포트 선택창을 엽니다.');
            }
        }

        if (!targetPort) {
            log('[서보] Dynamixel 컨트롤러 포트를 선택해주세요...');
            targetPort = await navigator.serial.requestPort({
                filters: USB_SERIAL_FILTERS,
            });

            if (!(await isServoControllerPort(targetPort))) {
                log('[서보] 선택한 포트에서 Dynamixel 응답을 확인하지 못했습니다.');
                return false;
            }
        }

        // 이미 사용 중인 포트인지 확인
        if (alreadyUsedPorts.includes(targetPort)) {
            log('[서보] 이미 사용 중인 포트입니다. 다른 포트를 선택해주세요.');
            return false;
        }

        await targetPort.open({ baudRate: 57600 });
        servoPort = targetPort;
        savePortConfig('servo', targetPort);

        servoReader = servoPort.readable.getReader();
        servoWriter = servoPort.writable.getWriter();

        log('[서보] Dynamixel 컨트롤러 연결 성공 (57600 baud)');

        readServoData();
        return true;
    } catch (error) {
        log('[서보] 연결 실패: ' + error.message);
        servoPort = null;
        servoReader = null;
        servoWriter = null;
        return false;
    }
}

async function readServoData() {
    try {
        while (true) {
            const { value, done } = await servoReader.read();
            if (done) break;
            // 서보 응답 처리 (필요시)
        }
    } catch (error) {
        log('[서보] 수신 오류: ' + error.message);
    }
}

// ========================================
// Modbus 명령 전송 함수
// ========================================

async function writeModbusRegister(regAddr, value) {
    if (!mainWriter) {
        log('[메인] 포트가 연결되지 않았습니다.');
        return false;
    }
    try {
        const packet = buildWriteSingleRegisterPacket(regAddr, value);
        await mainWriter.write(packet);

        let hexStr = `[전송] Modbus Write: Addr=0x${regAddr.toString(16).padStart(4, '0')} Value=${value} [`;
        for (let i = 0; i < packet.length; i++) {
            hexStr += packet[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
        }
        hexStr += ']';
        log(hexStr);

        await delay(50);
        return true;
    } catch (error) {
        log('[메인] 전송 오류: ' + error.message);
        return false;
    }
}

async function readModbusRegisters(startAddr, numRegs) {
    if (!mainWriter) {
        log('[메인] 포트가 연결되지 않았습니다.');
        return false;
    }
    try {
        const packet = buildReadRegistersPacket(startAddr, numRegs);
        await mainWriter.write(packet);

        let hexStr = `[전송] Modbus Read: Addr=0x${startAddr.toString(16).padStart(4, '0')} Count=${numRegs} [`;
        for (let i = 0; i < packet.length; i++) {
            hexStr += packet[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
        }
        hexStr += ']';
        log(hexStr);

        await delay(50);
        return true;
    } catch (error) {
        log('[메인] 전송 오류: ' + error.message);
        return false;
    }
}

// ========================================
// 장치 제어 함수 (Modbus 기반)
// ========================================

async function openDoor() {
    log('[문] 열기 명령 전송');
    return await writeModbusRegister(ModbusReg.DOOR_CMD, 1);
}

async function closeDoor() {
    log('[문] 닫기 명령 전송');
    return await writeModbusRegister(ModbusReg.DOOR_CMD, 2);
}

async function stopDoor() {
    log('[문] 정지 명령 전송');
    return await writeModbusRegister(ModbusReg.DOOR_CMD, 0);
}

async function setPump(on) {
    log(`[펌프] ${on ? 'ON' : 'OFF'} 명령 전송`);
    return await writeModbusRegister(ModbusReg.PUMP_CTRL, on ? 1 : 0);
}

async function setInverter(on) {
    log(`[인버터] 현재 펌웨어 레지스터에 연결되어 있지 않아 건너뜀 (${on ? 'ON' : 'OFF'})`);
    return true;
}

async function setFwd(on) {
    log(`[FWD] 현재 펌웨어 레지스터에 연결되어 있지 않아 건너뜀 (${on ? 'ON' : 'OFF'})`);
    return true;
}

async function setRev(on) {
    log(`[REV] 현재 펌웨어 레지스터에 연결되어 있지 않아 건너뜀 (${on ? 'ON' : 'OFF'})`);
    return true;
}

async function startCupPress() {
    log('[압축] 시작 명령 전송');
    return await writeModbusRegister(ModbusReg.CUP_PRESS_CTRL, 1);
}

async function stopCupPress() {
    log('[압축] 정지 명령 전송');
    return await writeModbusRegister(ModbusReg.CUP_PRESS_CTRL, 0);
}

async function classifyCurrentCup() {
    const isPaperCup = currentCupType === 'PAPER';
    const command = isPaperCup ? 2 : 1;
    log(`[분류] ${isPaperCup ? '종이컵' : 'PET컵'} ${isPaperCup ? '오른쪽' : '왼쪽'} 회전 명령 전송`);
    return await writeModbusRegister(ModbusReg.CLASSIFY_CTRL, command);
}

function setCurrentCupType(type) {
    currentCupType = type === 'PAPER' ? 'PAPER' : 'PET';
    log(`[분류] 컵 종류 설정: ${currentCupType}`);
}

async function getDoorStatus() {
    log('[상태] 문 상태 확인');
    return await readModbusRegisters(ModbusReg.DOOR_STATUS, 1);
}

async function sendServoCommand(packetArray) {
    if (!servoWriter) {
        log('[서보] 포트가 연결되지 않았습니다.');
        return false;
    }
    try {
        await servoWriter.write(packetArray);
        await delay(100);
        return true;
    } catch (error) {
        log('[서보] 전송 오류: ' + error.message);
        return false;
    }
}

// ========================================
// 서보 모터 제어 함수
// ========================================

async function enableTorque(id) {
    const packet = buildTorquePacket(id, true);
    log(`[서보] ID ${id} 토크 활성화`);
    return await sendServoCommand(packet);
}

async function moveGripper(open) {
    const id = 1;
    const angle = open ? 160 : 184;
    const position = Math.round((angle / 360) * 4095);
    const packet = buildPositionPacket(id, position);
    log(`[그리퍼] ${open ? '열기' : '닫기'}: ${angle}° → 위치 ${position}`);
    return await sendServoCommand(packet);
}

async function moveServo(forward) {
    const id = 2;
    const angle = forward ? 268.3 : 323;
    const position = Math.round((angle / 360) * 4095);
    const packet = buildPositionPacket(id, position);
    log(`[서보] ${forward ? '앞으로' : '뒤로'} 이동: ${angle}° → 위치 ${position}`);
    return await sendServoCommand(packet);
}

// ========================================
// UI 업데이트 함수
// ========================================

function updateDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
    });
    const timeStr = now.toLocaleTimeString('ko-KR');
    const datetimeElement = document.getElementById('datetime') || document.getElementById('admin-time');
    if (datetimeElement) {
        datetimeElement.textContent = `${dateStr} ${timeStr}`;
    }
}

setInterval(updateDateTime, 1000);
updateDateTime();

function showProcessScreen() {
    document.getElementById('mainScreen').style.display = 'none';
    document.getElementById('processScreen').classList.add('active');
    document.getElementById('emergencyBtn').style.display = 'block';
}

function hideProcessScreen() {
    document.getElementById('mainScreen').style.display = 'block';
    document.getElementById('processScreen').classList.remove('active');
    document.getElementById('emergencyBtn').style.display = 'none';
}

function updateProcessStep(step, icon, title, description) {
    document.getElementById('processIcon').textContent = icon;
    document.getElementById('processTitle').textContent = title;
    document.getElementById('processDescription').textContent = description;
    document.getElementById('processProgress').textContent = `${step} / ${totalSteps}`;
}

function showConfirmButton() {
    document.getElementById('confirmButton').style.display = 'block';
}

function hideConfirmButton() {
    document.getElementById('confirmButton').style.display = 'none';
}

function showCompletionActions() {
    const actions = document.getElementById('completionActions');
    if (actions) actions.classList.add('active');
}

function hideCompletionActions() {
    const actions = document.getElementById('completionActions');
    if (actions) actions.classList.remove('active');
}

function clearCompletionTimer() {
    if (completionTimer) {
        clearInterval(completionTimer);
        completionTimer = null;
    }
}

function startCompletionWait() {
    clearCompletionTimer();
    completionCountdown = 10;
    showCompletionActions();
    updateProcessStep(
        totalSteps,
        '✅',
        '완료!',
        `추가 투입하거나 처음으로 돌아갈 수 있습니다. ${completionCountdown}초 후 메인 화면으로 이동합니다.`,
    );

    completionTimer = setInterval(() => {
        completionCountdown -= 1;
        if (completionCountdown <= 0) {
            returnToMainScreen();
            return;
        }

        updateProcessStep(
            totalSteps,
            '✅',
            '완료!',
            `추가 투입하거나 처음으로 돌아갈 수 있습니다. ${completionCountdown}초 후 메인 화면으로 이동합니다.`,
        );
    }, 1000);
}

function enableStartButton() {
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.disabled = false;
        startButton.style.opacity = '1';
        startButton.style.cursor = 'pointer';
    }
}

function toggleLog() {
    const logPopup = document.getElementById('logPopup');
    logPopup.classList.toggle('active');
}

function log(message) {
    const logArea = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    logArea.value += `[${timestamp}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight;
}

function clearLog() {
    document.getElementById('log').value = '';
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========================================
// 시스템 초기화
// ========================================

async function initializeSystem() {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('PETCUP 시작');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('⚠️ 포트 선택 순서: 1) 메인485 → 2) 서보');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const systemBox = document.getElementById('systemBox');
    const systemStatusText = document.getElementById('systemStatusText') || document.getElementById('operationStatus');
    if (systemStatusText) {
        systemStatusText.textContent = '초기화 중...';
    }
    if (systemBox) {
        systemBox.classList.add('disabled');
    }

    // 1. 메인 컨트롤러 연결
    log('📦 [1/2] 메인 컨트롤러 연결 중...');
    let mainConnected = await connectMainController(true);
    if (!mainConnected && hasStoredPortConfig('main')) {
        log('[메인] 자동 연결 실패. 수동 선택으로 전환합니다.');
        mainConnected = await connectMainController(false);
    }
    if (!mainConnected) {
        log('❌ 메인 컨트롤러 연결 실패');
        if (systemStatusText) systemStatusText.textContent = '연결 실패';
        return;
    }

    await delay(500);

    // 2. 서보 컨트롤러 연결
    log('🤖 [2/2] 서보 컨트롤러 연결 중...');
    let servoConnected = await connectServoController(true);
    if (!servoConnected && hasStoredPortConfig('servo')) {
        log('[서보] 자동 연결 실패. 수동 선택으로 전환합니다.');
        servoConnected = await connectServoController(false);
    }
    if (!servoConnected) {
        log('❌ 서보 컨트롤러 연결 실패');
        if (systemStatusText) systemStatusText.textContent = '연결 실패';
        return;
    }

    await delay(500);

    // 서보 모터 토크 활성화
    log('⚙️ 서보 모터 초기화 중...');
    await enableTorque(1); // 그리퍼
    await delay(300);
    await enableTorque(2); // 메인 서보
    await delay(300);

    log('✅ 시스템 초기화 완료');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (systemStatusText) systemStatusText.textContent = '준비 완료';
    if (systemBox) systemBox.classList.remove('disabled');
    const startButton = document.getElementById('startButton');
    if (startButton) startButton.disabled = false;

    return true;
}

// ========================================
// 자동 프로세스
// ========================================

async function startProcess() {
    if (isProcessing) {
        log('⚠️ 프로세스가 이미 실행 중입니다.');
        return;
    }

    clearCompletionTimer();
    hideCompletionActions();
    hideConfirmButton();

    // 시스템 연결 상태 확인 및 자동 연결
    if (!mainWriter || !servoWriter) {
        log('🔌 시스템이 연결되지 않았습니다. 자동 연결을 시작합니다...');
        const initialized = await initializeSystem();
        if (!initialized && (!mainWriter || !servoWriter)) {
            log('❌ 시스템 연결에 실패했습니다. 프로세스를 시작할 수 없습니다.');
            alert('시스템 연결에 실패했습니다. 하드웨어 연결을 확인하세요.');
            return;
        }
        await delay(1000);
    }

    isProcessing = true;
    processStep = 0;

    showProcessScreen();

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🚀 자동 프로세스 시작 (Modbus RTU)');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        // 1단계: 투입구 열림
        processStep = 1;
        updateProcessStep(processStep, '🚪', '투입구 열기', '문이 열리고 있습니다...');
        log(`[${processStep}/${totalSteps}] 투입구 열기...`);
        await openDoor();
        await delay(3000);

        // 2단계: 그리퍼 열림
        processStep = 2;
        updateProcessStep(processStep, '🤏', '그리퍼 준비', '그리퍼가 펼쳐지고 있습니다...');
        log(`[${processStep}/${totalSteps}] 그리퍼 열기...`);
        await moveGripper(true);
        await delay(1500);

        // 3단계: 투입 완료 대기
        processStep = 3;
        updateProcessStep(processStep, '📦', '컵 투입', '컵을 투입구에 넣어주세요');
        log(`[${processStep}/${totalSteps}] 투입 완료 대기 중...`);
        showConfirmButton();
        waitingForConfirmation = true;
    } catch (error) {
        log('❌ 프로세스 실행 중 오류: ' + error.message);
        stopProcess();
    }
}

async function confirmInsertion() {
    if (!waitingForConfirmation) return;

    waitingForConfirmation = false;
    hideConfirmButton();

    try {
        // 4단계: 투입구 닫기 + 그리퍼 잡기
        processStep = 4;
        updateProcessStep(processStep, '🚪', '투입구 닫기', '투입구를 닫고 컵을 잡고 있습니다...');
        log(`[${processStep}/${totalSteps}] 투입구 닫기...`);
        await closeDoor();
        await delay(3000);
        log(`[${processStep}/${totalSteps}] 그리퍼 닫기...`);
        await moveGripper(false);
        await delay(1500);

        // 5단계: 세척 후 그리퍼 열기
        processStep = 5;
        updateProcessStep(processStep, '💧', '세척 중', '깨끗하게 세척하고 있습니다...');
        log(`[${processStep}/${totalSteps}] 물 분사 시작...`);
        await setPump(true);
        await delay(3000);
        await setPump(false);
        log('물 분사 완료');
        log(`[${processStep}/${totalSteps}] 그리퍼 열기...`);
        await moveGripper(true);
        await delay(1500);

        // 6단계: 압축 + 분류
        processStep = 6;
        updateProcessStep(processStep, '📦', '압축/분류 중', '컵을 압축한 뒤 적재함으로 분류하고 있습니다...');
        log(`[${processStep}/${totalSteps}] 압축 시작...`);
        await startCupPress();
        await delay(5000);
        log(`[${processStep}/${totalSteps}] 컵 분류 시작...`);
        await classifyCurrentCup();
        await delay(5000);

        // 프로세스 완료
        updateProcessStep(totalSteps, '✅', '완료!', '컵 처리가 완료되었습니다.');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('✅ 프로세스 완료!');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        isProcessing = false;
        enableStartButton();
        startCompletionWait();
    } catch (error) {
        log('❌ 프로세스 실행 중 오류: ' + error.message);
        stopProcess();
    }
}

async function stopProcess() {
    log('⚠️ 프로세스 중단!');
    isProcessing = false;
    waitingForConfirmation = false;
    processStep = 0;
    clearCompletionTimer();

    hideProcessScreen();
    hideConfirmButton();
    hideCompletionActions();

    enableStartButton();

    // 모든 모터 및 장치 정지
    if (mainWriter) {
        await stopDoor();
        await delay(200);
        await setPump(false);
        await delay(200);
        await stopCupPress();
        await delay(200);
        await writeModbusRegister(ModbusReg.CLASSIFY_CTRL, 0);
    }
}

function returnToMainScreen() {
    clearCompletionTimer();
    hideCompletionActions();
    hideConfirmButton();
    waitingForConfirmation = false;
    isProcessing = false;
    processStep = 0;
    hideProcessScreen();
    enableStartButton();
    log('[완료] 메인 화면으로 이동');
}

async function restartInsertion() {
    clearCompletionTimer();
    hideCompletionActions();
    waitingForConfirmation = false;
    isProcessing = false;
    processStep = 0;
    log('[완료] 추가 투입 시작');
    await startProcess();
}

async function emergencyStop() {
    if (!confirm('긴급 정지하시겠습니까?')) {
        return;
    }

    log('⚠️ 긴급 정지!');
    isProcessing = false;
    waitingForConfirmation = false;
    processStep = 0;
    clearCompletionTimer();

    hideProcessScreen();
    hideConfirmButton();
    hideCompletionActions();

    enableStartButton();

    // 긴급 정지: 모든 모터 및 장치 정지
    if (mainWriter) {
        await stopDoor();
        await delay(200);
        await setPump(false);
        await delay(200);
        await stopCupPress();
        await delay(200);
        await writeModbusRegister(ModbusReg.CLASSIFY_CTRL, 0);
    }
}

// ========================================
// 초기 로그
// ========================================

log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log('PETCUP v4.0 - Modbus RTU');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log('💡 Modbus RTU 프로토콜 지원');
log('🚀 "시작하기" 버튼을 눌러 프로세스를 시작하세요');
log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Web Serial API 지원 확인
if (!('serial' in navigator)) {
    log('⚠️ 경고: 이 브라우저는 Web Serial API를 지원하지 않습니다.');
    log('Chrome 또는 Edge 브라우저를 사용하세요.');
    document.getElementById('operationStatus').textContent = '지원 안됨';
    document.getElementById('operationStatus').style.color = '#e74c3c';
}
