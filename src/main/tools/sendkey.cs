using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace SudoLaunch {
    class Program {
        [DllImport("user32.dll", SetLastError = true)]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;

        static byte ParseKey(string k) {
            switch (k.Trim().ToLowerInvariant()) {
                case "win":
                case "windows":
                case "lwin":
                    return 0x5B;
                case "rwin":
                    return 0x5C;
                case "shift":
                case "lshift":
                case "rshift":
                    return 0x10;
                case "ctrl":
                case "control":
                case "lctrl":
                case "rctrl":
                    return 0x11;
                case "alt":
                case "menu":
                    return 0x12;
                case "space":
                    return 0x20;
                case "enter":
                case "return":
                    return 0x0D;
                case "esc":
                case "escape":
                    return 0x1B;
                case "tab":
                    return 0x09;
                case "~":
                case "tilde":
                case "`":
                    return 0xC0; // VK_OEM_3
                case "/":
                case "slash":
                    return 0xBF; // VK_OEM_2
                case "f1": return 0x70;
                case "f2": return 0x71;
                case "f3": return 0x72;
                case "f4": return 0x73;
                case "f5": return 0x74;
                case "f6": return 0x75;
                case "f7": return 0x76;
                case "f8": return 0x77;
                case "f9": return 0x78;
                case "f10": return 0x79;
                case "f11": return 0x7A;
                case "f12": return 0x7B;
                case "up": return 0x26;
                case "down": return 0x28;
                case "left": return 0x25;
                case "right": return 0x27;
                case "backspace": return 0x08;
                case "del":
                case "delete": return 0x2E;
                default:
                    if (k.Length == 1) {
                        char c = char.ToUpperInvariant(k[0]);
                        if (c >= 'A' && c <= 'Z') return (byte)c;
                        if (c >= '0' && c <= '9') return (byte)c;
                    }
                    return 0;
            }
        }

        static void Main(string[] args) {
            if (args.Length == 0) return;

            // Wait 120ms so previous window gets focus after SudoLaunch closes
            Thread.Sleep(120);

            string combo = args[0];
            string[] parts = combo.Split(new char[] { '+', ' ' }, StringSplitOptions.RemoveEmptyEntries);
            List<byte> keys = new List<byte>();

            foreach (var p in parts) {
                byte vk = ParseKey(p);
                if (vk != 0 && !keys.Contains(vk)) {
                    keys.Add(vk);
                }
            }

            if (keys.Count == 0) return;

            // Key downs in order
            foreach (byte k in keys) {
                uint flags = (k == 0x5B || k == 0x5C) ? KEYEVENTF_EXTENDEDKEY : 0;
                keybd_event(k, 0, flags, UIntPtr.Zero);
            }

            Thread.Sleep(40);

            // Key ups in reverse order
            for (int i = keys.Count - 1; i >= 0; i--) {
                byte k = keys[i];
                uint flags = KEYEVENTF_KEYUP | ((k == 0x5B || k == 0x5C) ? KEYEVENTF_EXTENDEDKEY : 0);
                keybd_event(k, 0, flags, UIntPtr.Zero);
            }
        }
    }
}
