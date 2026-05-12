const path = require('path');

module.exports = {
    packagerConfig: {
        name: 'CUPBOX_COSMO',
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'CUPBOX_COSMO',
                exe: 'CUPBOX-COSMO.exe',
            },
        },
    ],
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'CUPBOX_COSMO',
                authors: 'ReHAN Co. Ltd.',
                exe: 'CUPBOX COSMO.exe',
                setupExe: 'CUPBOX-COSMO-Setup.exe',
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['win32'],
        },
    ],
    plugins: [
        {
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {},
        },
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'rehan-repo',
                    name: 'cupbox-cosmo',
                },
                prerelease: false,
            },
        },
    ],
};
