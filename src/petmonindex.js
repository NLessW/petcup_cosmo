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

// SEN0591 거리 센서 포트
let sensorPort = null;
let sensorReader = null;
let sensorWriter = null;
let sensorPolling = false;

// 시스템 상태
let isProcessing = false;
let processStep = 0;
let waitingForConfirmation = false;
let totalSteps = 10;

// 수거 상태 변수
let currentCollectionPercent = 0;
const MAX_DISTANCE_MM = 575; // 575mm를 기준으로 설정

// Modbus RTU 설정
const MODBUS_SLAVE_ID = 1;

// ========================================
// Modbus RTU Register Map
// ========================================
const ModbusReg = {
    DOOR_CMD: 0x0000,
    DOOR_STATUS: 0x0001,
    UV_CTRL: 0x0002,
    PUMP_CTRL: 0x0003,
    FAN1_CTRL: 0x0004,
    FAN2_CTRL: 0x0005,
    INVERTER_CTRL: 0x0006,
    FWD_SIGNAL: 0x0007,
    REV_SIGNAL: 0x0008,
    DOOR_SPEED_OPEN: 0x0009,
    DOOR_SPEED_CLOSE: 0x000a,
    SENSOR_OPEN: 0x000b,
    SENSOR_CLOSE: 0x000c,
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
// SEN0591 거리 센서 함수
// ========================================

// SEN0591 센서 연결 (VID_0403+PID_6001+5&2B9650CC&0&8\0000)
async function connectDistanceSensor() {
    try {
        log('[센서] 거리 센서 포트를 선택해주세요...');

        // 이미 사용 중인 포트 제외
        const alreadyUsedPorts = [mainPort, servoPort].filter((p) => p !== null);

        const targetPort = await navigator.serial.requestPort({
            filters: [{ usbVendorId: 0x0403, usbProductId: 0x6001 }],
        });

        // 이미 사용 중인 포트인지 확인
        if (alreadyUsedPorts.includes(targetPort)) {
            log('[센서] 이미 사용 중인 포트입니다. 다른 포트를 선택해주세요.');
            return false;
        }

        sensorPort = targetPort;
        const baudRate = 115200;
        await sensorPort.open({
            baudRate: baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            flowControl: 'none',
        });

        sensorReader = sensorPort.readable.getReader();
        sensorWriter = sensorPort.writable.getWriter();

        log(`[센서] SEN0591 센서 연결 성공 (${baudRate} baud)`);

        // 데이터 수신 시작
        readSensorData();

        // 폴링 시작
        startSensorPolling();

        return true;
    } catch (error) {
        log(`[센서] 연결 실패: ${error.message}`);
        return false;
    }
}

// 센서에 거리 요청 명령 전송
async function sendSensorDistanceCommand() {
    if (!sensorWriter) return;

    try {
        // 명령: 0x01, 0x03, 0x01, 0x01, 0x00, 0x01, 0xd4, 0x36
        const command = new Uint8Array([0x01, 0x03, 0x01, 0x01, 0x00, 0x01, 0xd4, 0x36]);
        await sensorWriter.write(command);
    } catch (error) {
        log(`[센서] 명령 전송 오류: ${error.message}`);
    }
}

// 주기적으로 센서에 명령 전송 (200ms 간격)
async function startSensorPolling() {
    sensorPolling = true;

    while (sensorPolling && sensorPort) {
        await sendSensorDistanceCommand();
        await delay(200);
    }
}

// 센서 데이터 읽기
async function readSensorData() {
    let buffer = new Uint8Array(0);

    try {
        while (sensorPort) {
            const { value, done } = await sensorReader.read();
            if (done) break;

            if (value) {
                // 버퍼에 추가
                const newBuffer = new Uint8Array(buffer.length + value.length);
                newBuffer.set(buffer);
                newBuffer.set(value, buffer.length);
                buffer = newBuffer;

                // Modbus 응답 파싱
                buffer = parseSensorModbusResponse(buffer);
            }
        }
    } catch (error) {
        if (sensorPolling) {
            log(`[센서] 읽기 오류: ${error.message}`);
        }
    }
}

// Modbus 응답 파싱 및 % 계산
function parseSensorModbusResponse(buffer) {
    // Modbus 응답 형식: 0x01 0x03 0x02 [DATA_H] [DATA_L] [CRC_L] [CRC_H]
    // 최소 7바이트 필요
    while (buffer.length >= 7) {
        // 헤더 찾기: 0x01 0x03
        let headerIndex = -1;
        for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] === 0x01 && buffer[i + 1] === 0x03) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) {
            // 헤더 없음 - 버퍼 비우기
            return new Uint8Array();
        }

        // 헤더 이전 데이터 제거
        if (headerIndex > 0) {
            buffer = buffer.slice(headerIndex);
        }

        // 충분한 데이터가 있는지 확인
        if (buffer.length < 7) {
            break;
        }

        // 데이터 길이 확인
        if (buffer[2] === 0x02) {
            // 패킷 추출
            const packet = buffer.slice(0, 7);

            // CRC 검증 (Modbus RTU: Low Byte 먼저, High Byte 나중)
            const dataPart = packet.slice(0, 5);
            const receivedCRC = packet[5] | (packet[6] << 8);
            const calculatedCRC = calculateModbusCRC(dataPart);

            if (receivedCRC === calculatedCRC) {
                // 거리 데이터 추출 (mm 단위)
                const distanceMm = (packet[3] << 8) | packet[4];

                // 퍼센트 계산 (575mm 기준)
                // 0mm = 100%, 575mm 이상 = 0%
                let percent = 0;
                if (distanceMm >= 0 && distanceMm < MAX_DISTANCE_MM) {
                    percent = Math.round((1 - distanceMm / MAX_DISTANCE_MM) * 100);
                } else if (distanceMm >= MAX_DISTANCE_MM) {
                    percent = 0;
                }

                // 음수 방지
                if (percent < 0) percent = 0;
                if (percent > 100) percent = 100;

                currentCollectionPercent = percent;
                updateCollectionDisplay(percent, distanceMm);

                // 디버그 로그
                log(`[센서] 거리: ${distanceMm}mm, 수거율: ${percent}%`);
            } else {
                log(
                    `[센서] CRC 오류: 수신=0x${receivedCRC.toString(16).padStart(4, '0')}, 계산=0x${calculatedCRC.toString(16).padStart(4, '0')}`,
                );
            }

            // 처리된 패킷 제거
            buffer = buffer.slice(7);
        } else {
            // 잘못된 패킷 - 1바이트 건너뛰기
            buffer = buffer.slice(1);
        }
    }

    return buffer;
}

// 수거 상태 UI 업데이트
function updateCollectionDisplay(percent, distanceMm) {
    const inputStatus = document.getElementById('inputStatus');
    const inputStatusBox = document.getElementById('inputStatusBox');
    const startButton = document.getElementById('startButton');

    if (inputStatus) {
        // 90%일 때 불가능으로 표시
        if (percent >= 90) {
            inputStatus.textContent = '불가능 (90%)';
            inputStatus.style.color = '#e74c3c'; // 빨간색
            if (inputStatusBox) {
                inputStatusBox.classList.add('disabled');
            }
            // 시작 버튼 비활성화
            if (startButton && !isProcessing) {
                startButton.disabled = true;
                startButton.style.opacity = '0.5';
                startButton.style.cursor = 'not-allowed';
            }
        } else if (percent >= 80) {
            inputStatus.textContent = `가능 (${percent}%)`;
            inputStatus.style.color = '#f39c12'; // 주황색 (거의 가득 참)
            if (inputStatusBox) {
                inputStatusBox.classList.remove('disabled');
            }
            // 시작 버튼 활성화
            if (startButton && !isProcessing) {
                startButton.disabled = false;
                startButton.style.opacity = '1';
                startButton.style.cursor = 'pointer';
            }
        } else if (percent >= 50) {
            inputStatus.textContent = `가능 (${percent}%)`;
            inputStatus.style.color = '#f6ad55'; // 연한 주황색
            if (inputStatusBox) {
                inputStatusBox.classList.remove('disabled');
            }
            // 시작 버튼 활성화
            if (startButton && !isProcessing) {
                startButton.disabled = false;
                startButton.style.opacity = '1';
                startButton.style.cursor = 'pointer';
            }
        } else {
            inputStatus.textContent = `가능 (${percent}%)`;
            inputStatus.style.color = '#27ae60'; // 초록색
            if (inputStatusBox) {
                inputStatusBox.classList.remove('disabled');
            }
            // 시작 버튼 활성화
            if (startButton && !isProcessing) {
                startButton.disabled = false;
                startButton.style.opacity = '1';
                startButton.style.cursor = 'pointer';
            }
        }
    }
}

// 센서 연결 해제
async function disconnectSensor() {
    try {
        sensorPolling = false;

        if (sensorReader) {
            await sensorReader.cancel();
            sensorReader.releaseLock();
            sensorReader = null;
        }

        if (sensorWriter) {
            sensorWriter.releaseLock();
            sensorWriter = null;
        }

        if (sensorPort) {
            await sensorPort.close();
            sensorPort = null;
        }

        log('[센서] 연결이 해제되었습니다.');
    } catch (error) {
        log(`[센서] 연결 해제 오류: ${error.message}`);
    }
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

async function connectMainController() {
    try {
        log('[메인] Modbus RTU 컨트롤러 포트를 선택해주세요...');

        // 이미 사용 중인 포트 목록
        const alreadyUsedPorts = [sensorPort, servoPort].filter((p) => p !== null);

        const targetPort = await navigator.serial.requestPort({
            filters: [{ usbVendorId: 0x0403, usbProductId: 0x6001 }],
        });

        // 이미 사용 중인 포트인지 확인
        if (alreadyUsedPorts.includes(targetPort)) {
            log('[메인] 이미 사용 중인 포트입니다. 다른 포트를 선택해주세요.');
            return false;
        }

        mainPort = targetPort;
        await mainPort.open({ baudRate: 9600 });

        mainReader = mainPort.readable.getReader();
        mainWriter = mainPort.writable.getWriter();

        log('[메인] Modbus RTU 컨트롤러 연결 성공 (9600 baud)');
        log('[메인] Modbus Slave ID: ' + MODBUS_SLAVE_ID);

        readMainData();
        return true;
    } catch (error) {
        log('[메인] 연결 실패: ' + error.message);
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

async function connectServoController() {
    try {
        log('[서보] Dynamixel 컨트롤러 포트를 선택해주세요...');

        // 이미 사용 중인 포트 목록
        const alreadyUsedPorts = [mainPort, sensorPort].filter((p) => p !== null);

        const targetPort = await navigator.serial.requestPort({
            filters: [{ usbVendorId: 0x0403, usbProductId: 0x6001 }],
        });

        // 이미 사용 중인 포트인지 확인
        if (alreadyUsedPorts.includes(targetPort)) {
            log('[서보] 이미 사용 중인 포트입니다. 다른 포트를 선택해주세요.');
            return false;
        }

        servoPort = targetPort;
        await servoPort.open({ baudRate: 57600 });

        servoReader = servoPort.readable.getReader();
        servoWriter = servoPort.writable.getWriter();

        log('[서보] Dynamixel 컨트롤러 연결 성공 (57600 baud)');

        readServoData();
        return true;
    } catch (error) {
        log('[서보] 연결 실패: ' + error.message);
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

async function setUV(on) {
    log(`[UV] ${on ? 'ON' : 'OFF'} 명령 전송`);
    return await writeModbusRegister(ModbusReg.UV_CTRL, on ? 1 : 0);
}

async function setPump(on) {
    log(`[펌프] ${on ? 'ON' : 'OFF'} 명령 전송`);
    return await writeModbusRegister(ModbusReg.PUMP_CTRL, on ? 1 : 0);
}

async function setFan(on) {
    log(`[팬] ${on ? 'ON' : 'OFF'} 명령 전송`);
    await writeModbusRegister(ModbusReg.FAN1_CTRL, on ? 1 : 0);
    await delay(50);
    return await writeModbusRegister(ModbusReg.FAN2_CTRL, on ? 1 : 0);
}

async function setInverter(on) {
    log(`[인버터] ${on ? 'ON' : 'OFF'} 명령 전송`);
    return await writeModbusRegister(ModbusReg.INVERTER_CTRL, on ? 1 : 0);
}

async function setFwd(on) {
    log(`[FWD] ${on ? 'ON' : 'OFF'} 명령 전송`);
    return await writeModbusRegister(ModbusReg.FWD_SIGNAL, on ? 1 : 0);
}

async function setRev(on) {
    log(`[REV] ${on ? 'ON' : 'OFF'} 명령 전송`);
    return await writeModbusRegister(ModbusReg.REV_SIGNAL, on ? 1 : 0);
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
    log('⚠️ 포트 선택 순서: 1) 거리센서 → 2) 메인485 → 3) 서보');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const systemBox = document.getElementById('systemBox');
    const systemStatusText = document.getElementById('systemStatusText') || document.getElementById('operationStatus');
    if (systemStatusText) {
        systemStatusText.textContent = '초기화 중...';
    }
    if (systemBox) {
        systemBox.classList.add('disabled');
    }

    // 1. 거리 센서 연결 (먼저 연결)
    log('📏 [1/3] 거리 센서 연결 중...');
    const sensorConnected = await connectDistanceSensor();
    if (!sensorConnected) {
        log('❌ 거리 센서 연결 실패');
        if (systemStatusText) systemStatusText.textContent = '연결 실패';
        return;
    }

    await delay(500);

    // 2. 메인 컨트롤러 연결
    log('📦 [2/3] 메인 컨트롤러 연결 중...');
    const mainConnected = await connectMainController();
    if (!mainConnected) {
        log('❌ 메인 컨트롤러 연결 실패');
        if (systemStatusText) systemStatusText.textContent = '연결 실패';
        return;
    }

    await delay(500);

    // 3. 서보 컨트롤러 연결
    log('🤖 [3/3] 서보 컨트롤러 연결 중...');
    const servoConnected = await connectServoController();
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

    // 수거율이 100%인지 확인
    if (currentCollectionPercent >= 90) {
        log('⚠️ 수거함이 가득 찼습니다. 비운 후 다시 시도해주세요.');
        alert('수거함이 가득 찼습니다 (100%).\n수거함을 비운 후 다시 시도해주세요.');
        return;
    }

    // 시스템 연결 상태 확인 및 자동 연결
    if (!mainWriter || !servoWriter || !sensorWriter) {
        log('🔌 시스템이 연결되지 않았습니다. 자동 연결을 시작합니다...');
        const initialized = await initializeSystem();
        if (!initialized && (!mainWriter || !servoWriter || !sensorWriter)) {
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
        // UV와 FAN 켜기
        log('💡 UV 라이트 및 팬 가동 중...');
        await setUV(true);
        await setFan(true);
        await delay(500);

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
        // 4단계: 그리퍼 닫기
        processStep = 4;
        updateProcessStep(processStep, '✊', '컵 잡기', '컵을 잡고 있습니다...');
        log(`[${processStep}/${totalSteps}] 그리퍼 닫기...`);
        await moveGripper(false);
        await delay(1500);

        // 5단계: 문 닫기
        processStep = 5;
        updateProcessStep(processStep, '🚪', '투입구 닫기', '투입구를 닫고 있습니다...');
        log(`[${processStep}/${totalSteps}] 투입구 닫기...`);
        await closeDoor();
        await delay(3000);

        // 6단계: 물 3초 분사 + 2초 대기
        processStep = 6;
        updateProcessStep(processStep, '💧', '세척 중', '깨끗하게 세척하고 있습니다...');
        log(`[${processStep}/${totalSteps}] 물 분사 시작...`);
        await setPump(true);
        await delay(3000);
        await setPump(false);
        log('물 분사 완료');
        log('세척 후 대기 중...');
        await delay(2000);

        // 7단계: 서보 모터 뒤로 이동
        processStep = 7;
        updateProcessStep(processStep, '🔄', '이동 중', '투입 위치로 이동하고 있습니다...');
        log(`[${processStep}/${totalSteps}] 서보 모터 뒤로 이동...`);
        await moveServo(false);
        await delay(2000);

        // 8단계: 그리퍼 열고 2초 대기
        processStep = 8;
        updateProcessStep(processStep, '📤', '투입 중', '컵을 투입하고 있습니다...');
        log(`[${processStep}/${totalSteps}] 그리퍼 열기 (투입)...`);
        await moveGripper(true);
        await delay(2000);

        // 9단계: 그리퍼 닫기
        processStep = 9;
        updateProcessStep(processStep, '🔄', '정리 중', '투입하신 컵을 정리중입니다...');
        log(`[${processStep}/${totalSteps}] 그리퍼 닫기...`);
        await moveGripper(false);
        await delay(1500);

        // 10단계: 서보 모터 앞으로 (초기 위치)
        processStep = 10;
        updateProcessStep(processStep, '🏠', '복귀 중', '초기 위치로 돌아가고 있습니다...');
        log(`[${processStep}/${totalSteps}] 서보 모터 앞으로 이동...`);
        await moveServo(true);
        await delay(2000);

        // 프로세스 완료
        updateProcessStep(10, '✅', '완료!', '감사합니다. 포인트가 적립되었습니다.');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        log('✅ 프로세스 완료!');
        log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // FA-50 인버터 3초 추가 가동
        log('⚡ FA-50 인버터 3초 추가 가동 중...');
        await delay(3000);

        // UV, FAN, FWD 신호 끄기 (MC12B는 계속 켜진 상태 유지)
        log('💡 UV 라이트, 팬, FWD 신호 정지...');
        await setUV(false);
        await delay(200);
        await setFan(false);
        await delay(200);
        await setFwd(false);
        log('✅ MC12B(Pin 51)는 계속 켜진 상태로 유지됩니다.');

        await delay(3000);
        isProcessing = false;
        hideProcessScreen();

        // 수거율에 따라 버튼 상태 결정
        const startButton = document.getElementById('startButton');
        if (currentCollectionPercent >= 90) {
            startButton.disabled = true;
            startButton.style.opacity = '0.5';
            startButton.style.cursor = 'not-allowed';
        } else {
            startButton.disabled = false;
            startButton.style.opacity = '1';
            startButton.style.cursor = 'pointer';
        }
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

    hideProcessScreen();
    hideConfirmButton();

    // 수거율에 따라 버튼 상태 결정
    const startButton = document.getElementById('startButton');
    if (currentCollectionPercent >= 90) {
        startButton.disabled = true;
        startButton.style.opacity = '0.5';
        startButton.style.cursor = 'not-allowed';
    } else {
        startButton.disabled = false;
        startButton.style.opacity = '1';
        startButton.style.cursor = 'pointer';
    }

    // 모든 모터 및 장치 정지 (MC12B는 유지)
    if (mainWriter) {
        await stopDoor();
        await delay(200);
        await setPump(false);
        await delay(200);
        await setUV(false);
        await delay(200);
        await setFan(false);
        await delay(200);
        await setFwd(false);
    }
}

async function emergencyStop() {
    if (!confirm('긴급 정지하시겠습니까?')) {
        return;
    }

    log('⚠️ 긴급 정지!');
    isProcessing = false;
    waitingForConfirmation = false;
    processStep = 0;

    hideProcessScreen();
    hideConfirmButton();

    // 수거율에 따라 버튼 상태 결정
    const startButton = document.getElementById('startButton');
    if (currentCollectionPercent >= 90) {
        startButton.disabled = true;
        startButton.style.opacity = '0.5';
        startButton.style.cursor = 'not-allowed';
    } else {
        startButton.disabled = false;
        startButton.style.opacity = '1';
        startButton.style.cursor = 'pointer';
    }

    // 긴급 정지: 모든 모터 및 장치 정지 (MC12B는 유지)
    if (mainWriter) {
        await stopDoor();
        await delay(200);
        await setPump(false);
        await delay(200);
        await setUV(false);
        await delay(200);
        await setFan(false);
        await delay(200);
        await setFwd(false);
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
