/**
 * Web MIDI Manager
 * Handles hardware MIDI keyboard discovery, hotplugging, event handling,
 * device selection, and human-readable MIDI activity logging.
 */
class MidiManager {
    constructor(callbacks = {}) {
        this.midiAccess = null;
        this.selectedDevice = 'all';
        this.isRefreshing = false;
        this.refreshAgain = false;

        this.onNoteOn = callbacks.onNoteOn || (() => {});
        this.onNoteOff = callbacks.onNoteOff || (() => {});
        this.onVolumeChange = callbacks.onVolumeChange || (() => {});
        this.onAllNotesOff = callbacks.onAllNotesOff || (() => {});
        this.onStatusUpdate = callbacks.onStatusUpdate || (() => {});
        this.onActivityUpdate = callbacks.onActivityUpdate || (() => {});
        this.onDeviceListUpdate = callbacks.onDeviceListUpdate || (() => {});

        this.MIDI_TYPE_NAMES = {
            0x80: 'Note Off',
            0x90: 'Note On',
            0xA0: 'Aftertouch',
            0xB0: 'Control Change',
            0xC0: 'Program Change',
            0xD0: 'Channel Pressure',
            0xE0: 'Pitch Bend'
        };
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            this.onStatusUpdate('Web MIDI is not supported in this browser. Try Chrome or Edge.', 'warning');
            return false;
        }

        this.onStatusUpdate('Requesting MIDI access…', 'info');
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
        } catch (err) {
            this.midiAccess = null;
            this.onStatusUpdate(
                `MIDI access was refused (${err.message || err.name}). Allow MIDI for this site using the permission icon in the address bar, then press refresh.`,
                'error'
            );
            return false;
        }

        this.midiAccess.onstatechange = () => {
            this.refreshDevices();
        };

        await this.refreshDevices();
        return true;
    }

    async refreshDevices() {
        if (!this.midiAccess) {
            await this.init();
            return;
        }

        if (this.isRefreshing) {
            this.refreshAgain = true;
            return;
        }

        this.isRefreshing = true;
        try {
            do {
                this.refreshAgain = false;
                await this._rebuildDeviceList();
            } while (this.refreshAgain);
        } finally {
            this.isRefreshing = false;
        }
    }

    async _rebuildDeviceList() {
        const deviceList = [{ id: 'all', name: 'All inputs' }];
        const activeNames = [];
        const portErrors = [];

        for (const input of this.midiAccess.inputs.values()) {
            if (input.state === 'disconnected') continue;

            const label = input.name + (input.manufacturer ? ` by ${input.manufacturer}` : '');
            deviceList.push({ id: input.id, name: label });
            activeNames.push(input.name);

            input.onmidimessage = (event) => this._handleMidiMessage(event);

            try {
                await input.open();
            } catch (err) {
                portErrors.push(input.name);
                console.warn('Could not open MIDI input port', input.name, err);
            }
        }

        this.onDeviceListUpdate(deviceList, this.selectedDevice);

        if (activeNames.length === 0) {
            this.onStatusUpdate('No MIDI keyboard found. Plug it in, then press refresh.', 'muted');
        } else if (portErrors.length > 0) {
            this.onStatusUpdate(
                `Found ${activeNames.join(', ')}, but could not open ${portErrors.join(', ')}. Another program may be using it.`,
                'warning'
            );
        } else {
            this.onStatusUpdate(`MIDI ready: ${activeNames.join(', ')}`, 'success');
        }
    }

    setSelectedDevice(deviceId) {
        this.selectedDevice = deviceId || 'all';
    }

    _handleMidiMessage(event) {
        if (this.selectedDevice && this.selectedDevice !== 'all' && event.target.id !== this.selectedDevice) {
            return;
        }

        const data = event.data;
        if (!data || data.length === 0) return;

        const statusByte = data[0];
        if (statusByte >= 0xF0) return; // Real-time/system messages ignore

        const type = statusByte & 0xF0;
        const channel = (statusByte & 0x0F) + 1;
        const data1 = data.length > 1 ? data[1] : 0;
        const data2 = data.length > 2 ? data[2] : 0;

        const typeName = this.MIDI_TYPE_NAMES[type] || ('0x' + type.toString(16));
        const activityText = `Last MIDI message: ${typeName} · channel ${channel} · ${data1}${data.length > 2 ? ' · ' + data2 : ''}`;
        this.onActivityUpdate(activityText);

        switch (type) {
            case 0x90: // Note On
                if (data2 > 0) {
                    this.onNoteOn(data1, data2);
                } else {
                    this.onNoteOff(data1);
                }
                break;

            case 0x80: // Note Off
                this.onNoteOff(data1);
                break;

            case 0xB0: // Control Change
                if (data1 === 7) { // CC 7: Volume
                    const volPercent = Math.max(1, Math.round((100 * data2) / 127));
                    this.onVolumeChange(volPercent);
                } else if (data1 === 120 || data1 === 123) { // All sound off / all notes off
                    this.onAllNotesOff();
                }
                break;
        }
    }
}

if (typeof window !== 'undefined') {
    window.MidiManager = MidiManager;
}
