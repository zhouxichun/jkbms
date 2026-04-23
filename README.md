# jkbms
Read data and config from JKBMS via BLE.

#support:
device: JK_B1A8S10P,
hardware_version: 15H,
software_version: 15.41

# 1. 安装蓝牙依赖
sudo apt install bluetooth bluez libbluetooth-dev libudev-dev -y

# 2. 安装 noble
npm install @abandonware/noble

# 3. 如果蓝牙被block
sudo rfkill unblock bluetooth

# 4. 给 node 永久蓝牙权限
sudo setcap cap_net_raw+eip $(eval readlink -f `which node`)

# 5. power on
sudo hciconfig hci0 up

