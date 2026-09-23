using System;
using System.Diagnostics;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace SudoLaunch {
    class SwapHook {
        // --- Win32 Hook Constants ---
        private const int WH_KEYBOARD_LL = 13;
        private const int WH_MOUSE_LL = 14;

        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        private const int WM_MOUSEMOVE = 0x0200;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_LBUTTONUP = 0x0202;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_RBUTTONUP = 0x0205;
        private const int WM_MBUTTONDOWN = 0x0207;
        private const int WM_MBUTTONUP = 0x0208;
        private const int WM_MOUSEWHEEL = 0x020A;
        private const int WM_XBUTTONDOWN = 0x020B;
        private const int WM_XBUTTONUP = 0x020C;
        private const int WM_MOUSEHWHEEL = 0x020E;

        // --- Win32 Input Constants ---
        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_XDOWN = 0x0080;
        private const uint MOUSEEVENTF_XUP = 0x0100;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_HWHEEL = 0x01000;

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        private const uint WM_QUIT = 0x0012;

        // System metrics for multi-monitor virtual screen
        private const int SM_XVIRTUALSCREEN = 76;
        private const int SM_YVIRTUALSCREEN = 77;
        private const int SM_CXVIRTUALSCREEN = 78;
        private const int SM_CYVIRTUALSCREEN = 79;

        // Emergency Release / Toggle Keycodes
        private const int VK_PAUSE = 0x13;
        private const int VK_SCROLL = 0x91; // ScrollLock
        private const int VK_CONTROL = 0x11;
        private const int VK_MENU = 0x12; // Alt
        private const int VK_S = 0x53;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT {
            public int x;
            public int y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT {
            public POINT pt;
            public uint mouseData;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSG {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public POINT pt;
        }

        private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

        [DllImport("user32.dll")]
        private static extern bool TranslateMessage([In] ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern IntPtr DispatchMessage([In] ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern void PostQuitMessage(int nExitCode);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool PostThreadMessage(uint idThread, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        private static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool GetCursorPos(out POINT pt);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetProcessWindowStation(IntPtr hWinSta);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetThreadDesktop(IntPtr hDesktop);

        [DllImport("winmm.dll", EntryPoint = "timeBeginPeriod")]
        private static extern uint timeBeginPeriod(uint uMilliseconds);

        [DllImport("winmm.dll", EntryPoint = "timeEndPeriod")]
        private static extern uint timeEndPeriod(uint uMilliseconds);

        private static IntPtr _mouseHookID = IntPtr.Zero;
        private static IntPtr _keyboardHookID = IntPtr.Zero;
        private static HookProc _mouseProc;
        private static HookProc _keyboardProc;

        private static uint _mainThreadId;
        private static volatile bool _running = true;

        private static int _centerX = 960;
        private static int _centerY = 540;
        private static int _origMouseX = -1;
        private static int _origMouseY = -1;

        private static volatile bool _shuttingDown = false;
        private static readonly object _queueLock = new object();
        private static readonly Queue<string> _eventQueue = new Queue<string>();

        // Inject mode: tracked cursor position for 1:1 pixel mapping
        private static int _remoteX = -1;
        private static int _remoteY = -1;

        // Overlay banner hit test (optional, allows clicking Return Input banner)
        private static bool _hasBannerRect = false;
        private static int _bannerX1 = 0;
        private static int _bannerY1 = 0;
        private static int _bannerX2 = 0;
        private static int _bannerY2 = 0;

        private static void AttachToInteractiveDesktop() {
            try {
                SetProcessDPIAware();
            } catch {
                // Ignore
            }

            try {
                IntPtr hwinsta = OpenWindowStation("winsta0", false, 0x037F);
                if (hwinsta != IntPtr.Zero) {
                    SetProcessWindowStation(hwinsta);
                    IntPtr hdesk = OpenDesktop("default", 0, false, 0x01FF);
                    if (hdesk != IntPtr.Zero) {
                        SetThreadDesktop(hdesk);
                    }
                }
            } catch {
                // Ignore if running without desktop permissions
            }
        }

        static int Main(string[] args) {
            AttachToInteractiveDesktop();

            string mode = args.Length > 0 ? args[0].ToLowerInvariant() : "help";

            if (mode == "capture") {
                // Optional overlay rect: capture <x> <y> <width> <height>
                if (args.Length >= 5) {
                    try {
                        int bx = int.Parse(args[1]);
                        int by = int.Parse(args[2]);
                        int bw = int.Parse(args[3]);
                        int bh = int.Parse(args[4]);
                        _bannerX1 = bx;
                        _bannerY1 = by;
                        _bannerX2 = bx + bw;
                        _bannerY2 = by + bh;
                        _hasBannerRect = true;
                    } catch {
                        // Ignore parse error
                    }
                }
                return RunCaptureMode();
            } else if (mode == "inject") {
                return RunInjectMode();
            } else {
                Console.WriteLine("Usage: swaphook.exe <capture|inject> [bannerX bannerY bannerW bannerH]");
                return 0;
            }
        }

        // ==========================================
        // CAPTURE MODE (Host Machine)
        // ==========================================
        private static int RunCaptureMode() {
            _mainThreadId = GetCurrentThreadId();
            _mouseProc = MouseHookCallback;
            _keyboardProc = KeyboardHookCallback;

            // Spans the primary screen center (always on a real monitor)
            int primW = GetSystemMetrics(0); // SM_CXSCREEN
            int primH = GetSystemMetrics(1); // SM_CYSCREEN
            if (primW <= 0) primW = 1920;
            if (primH <= 0) primH = 1080;
            _centerX = primW / 2;
            _centerY = primH / 2;

            POINT orig;
            if (GetCursorPos(out orig)) {
                _origMouseX = orig.x;
                _origMouseY = orig.y;
            }

            // Immediately center cursor on primary display
            SetCursorPos(_centerX, _centerY);

            timeBeginPeriod(1);

            IntPtr modHandle;
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule) {
                modHandle = GetModuleHandle(curModule.ModuleName);
            }

            _mouseHookID = SetWindowsHookEx(WH_MOUSE_LL, _mouseProc, modHandle, 0);
            _keyboardHookID = SetWindowsHookEx(WH_KEYBOARD_LL, _keyboardProc, modHandle, 0);

            if (_mouseHookID == IntPtr.Zero || _keyboardHookID == IntPtr.Zero) {
                Console.Error.WriteLine("ERROR:FAILED_TO_INSTALL_HOOKS");
                Unhook();
                return 1;
            }

            Console.WriteLine("STATUS:READY");
            Console.Out.Flush();

            // Non-blocking sender thread: drains event queue and writes to stdout
            // The hook callback never does I/O — it only enqueues, so it never blocks or times out
            Thread senderThread = new Thread(() => {
                var batch = new List<string>(64);
                while (_running && !_shuttingDown) {
                    batch.Clear();
                    lock (_queueLock) {
                        while (_eventQueue.Count == 0 && _running && !_shuttingDown) {
                            Monitor.Wait(_queueLock, 2);
                        }
                        while (_eventQueue.Count > 0) {
                            batch.Add(_eventQueue.Dequeue());
                        }
                    }
                    for (int i = 0; i < batch.Count; i++) {
                        Console.WriteLine(batch[i]);
                    }
                    if (batch.Count > 0) {
                        Console.Out.Flush();
                    }
                }
                // Final drain on TOGGLE shutdown
                if (_shuttingDown) {
                    lock (_queueLock) {
                        while (_eventQueue.Count > 0) {
                            Console.WriteLine(_eventQueue.Dequeue());
                        }
                    }
                    Console.Out.Flush();
                    Unhook();
                    PostThreadMessage(_mainThreadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
                }
            }) {
                IsBackground = true
            };
            senderThread.Start();

            // Stdin listener thread to cleanly stop on command
            Thread stdinThread = new Thread(() => {
                string line;
                while (_running && (line = Console.ReadLine()) != null) {
                    string cmd = line.Trim().ToUpperInvariant();
                    if (cmd == "STOP" || cmd == "QUIT" || cmd == "EXIT") {
                        _running = false;
                        PostThreadMessage(_mainThreadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
                        break;
                    }
                }
            }) {
                IsBackground = true
            };
            stdinThread.Start();

            // Standard Win32 message pump for low-level hooks
            MSG msg;
            while (_running && GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            Unhook();
            return 0;
        }

        private static void Unhook() {
            _running = false;
            try {
                timeEndPeriod(1);
            } catch {
                // Ignore
            }
            if (_mouseHookID != IntPtr.Zero) {
                UnhookWindowsHookEx(_mouseHookID);
                _mouseHookID = IntPtr.Zero;
            }
            if (_keyboardHookID != IntPtr.Zero) {
                UnhookWindowsHookEx(_keyboardHookID);
                _keyboardHookID = IntPtr.Zero;
            }
            if (_origMouseX != -1 && _origMouseY != -1) {
                SetCursorPos(_origMouseX, _origMouseY);
            }
        }

        private static void EnqueueEvent(string evt) {
            lock (_queueLock) {
                _eventQueue.Enqueue(evt);
                Monitor.Pulse(_queueLock);
            }
        }

        private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (nCode >= 0 && _running) {
                MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));

                // Ignore synthesized/injected events to prevent feedback loops
                if ((hookStruct.flags & 1) != 0) {
                    return CallNextHookEx(_mouseHookID, nCode, wParam, lParam);
                }

                int msg = (int)wParam;

                // Check overlay banner click: if clicking "Return Input", trigger toggle back!
                if (_hasBannerRect && msg == WM_LBUTTONUP) {
                    if (hookStruct.pt.x >= _bannerX1 && hookStruct.pt.x <= _bannerX2 &&
                        hookStruct.pt.y >= _bannerY1 && hookStruct.pt.y <= _bannerY2) {
                        EnqueueEvent("TOGGLE");
                        _shuttingDown = true;
                        return (IntPtr)1;
                    }
                }

                if (msg == WM_MOUSEMOVE) {
                    // Compute delta from ACTUAL cursor position vs proposed position
                    // hookStruct.pt = where cursor WOULD move to
                    // GetCursorPos = where cursor actually IS right now
                    // delta = proposed - actual = true hardware delta
                    // This is correct regardless of suppression state because:
                    //   - We suppress (return 1), so cursor stays at actual position
                    //   - Windows computes next hookStruct.pt from actual + new raw input
                    //   - So each event's delta is independently correct
                    POINT actual;
                    if (!GetCursorPos(out actual)) {
                        return (IntPtr)1;
                    }

                    int dx = hookStruct.pt.x - actual.x;
                    int dy = hookStruct.pt.y - actual.y;

                    if (dx != 0 || dy != 0) {
                        EnqueueEvent("M M " + dx + " " + dy);
                    }

                    // Safety: if cursor drifted from center (e.g. another app moved it),
                    // warp it back to prevent screen-edge clamping from swallowing deltas
                    if (Math.Abs(actual.x - _centerX) > 50 || Math.Abs(actual.y - _centerY) > 50) {
                        SetCursorPos(_centerX, _centerY);
                    }

                    return (IntPtr)1; // Suppress local cursor movement
                }

                if (msg == WM_LBUTTONDOWN) {
                    EnqueueEvent("M D 1");
                    return (IntPtr)1;
                } else if (msg == WM_LBUTTONUP) {
                    EnqueueEvent("M U 1");
                    return (IntPtr)1;
                } else if (msg == WM_RBUTTONDOWN) {
                    EnqueueEvent("M D 2");
                    return (IntPtr)1;
                } else if (msg == WM_RBUTTONUP) {
                    EnqueueEvent("M U 2");
                    return (IntPtr)1;
                } else if (msg == WM_MBUTTONDOWN) {
                    EnqueueEvent("M D 3");
                    return (IntPtr)1;
                } else if (msg == WM_MBUTTONUP) {
                    EnqueueEvent("M U 3");
                    return (IntPtr)1;
                } else if (msg == WM_MOUSEWHEEL) {
                    short delta = (short)((hookStruct.mouseData >> 16) & 0xffff);
                    EnqueueEvent("M W " + delta);
                    return (IntPtr)1;
                } else if (msg == WM_MOUSEHWHEEL) {
                    short delta = (short)((hookStruct.mouseData >> 16) & 0xffff);
                    EnqueueEvent("M HW " + delta);
                    return (IntPtr)1;
                } else if (msg == WM_XBUTTONDOWN) {
                    int btn = ((hookStruct.mouseData >> 16) & 0xffff) == 1 ? 4 : 5;
                    EnqueueEvent("M D " + btn);
                    return (IntPtr)1;
                } else if (msg == WM_XBUTTONUP) {
                    int btn = ((hookStruct.mouseData >> 16) & 0xffff) == 1 ? 4 : 5;
                    EnqueueEvent("M U " + btn);
                    return (IntPtr)1;
                }
            }
            return CallNextHookEx(_mouseHookID, nCode, wParam, lParam);
        }

        private static IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (nCode >= 0 && _running) {
                KBDLLHOOKSTRUCT hookStruct = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
                int msg = (int)wParam;
                bool isDown = (msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN);
                bool isUp = (msg == WM_KEYUP || msg == WM_SYSKEYUP);

                if (isDown || isUp) {
                    uint vk = hookStruct.vkCode;
                    uint scan = hookStruct.scanCode;
                    uint ext = (hookStruct.flags & 1); // LLKHF_EXTENDED

                    // Safety Toggle Check: ScrollLock, Pause, or Ctrl+Alt+S
                    bool isToggleKey = (vk == VK_SCROLL || vk == VK_PAUSE);
                    if (!isToggleKey && vk == VK_S && isDown) {
                        bool ctrl = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
                        bool alt = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
                        if (ctrl && alt) isToggleKey = true;
                    }

                    if (isToggleKey && isDown) {
                        EnqueueEvent("TOGGLE");
                        _shuttingDown = true;
                        return (IntPtr)1;
                    }

                    string typeStr = isDown ? "D" : "U";
                    EnqueueEvent("K " + typeStr + " " + vk + " " + scan + " " + ext);

                    return (IntPtr)1; // Suppress local keystroke
                }
            }
            return CallNextHookEx(_keyboardHookID, nCode, wParam, lParam);
        }

        // ==========================================
        // INJECT MODE (Target/Receiver Machine)
        // ==========================================
        private static int RunInjectMode() {
            try {
                timeBeginPeriod(1);
            } catch {
                // Ignore
            }

            Console.WriteLine("STATUS:INJECT_READY");
            Console.Out.Flush();

            string line;
            while ((line = Console.ReadLine()) != null) {
                line = line.Trim();
                if (line.Length == 0) continue;

                if (line == "STOP" || line == "QUIT" || line == "EXIT") {
                    break;
                } else if (line == "RELEASE") {
                    ReleaseAll();
                    continue;
                }

                try {
                    string[] parts = line.Split(' ');
                    if (parts[0] == "M" && parts.Length >= 3) {
                        string sub = parts[1];
                        if (sub == "M" && parts.Length >= 4) {
                            int dx = int.Parse(parts[2]);
                            int dy = int.Parse(parts[3]);

                            // Track cursor position for exact 1:1 pixel mapping
                            // (bypasses receiver's pointer acceleration settings)
                            if (_remoteX == -1) {
                                POINT cur;
                                if (GetCursorPos(out cur)) {
                                    _remoteX = cur.x;
                                    _remoteY = cur.y;
                                } else {
                                    _remoteX = GetSystemMetrics(0) / 2;
                                    _remoteY = GetSystemMetrics(1) / 2;
                                }
                            }

                            _remoteX += dx;
                            _remoteY += dy;

                            // Clamp to virtual screen bounds
                            int vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
                            int vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
                            int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                            int vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                            if (vw <= 0) vw = GetSystemMetrics(0);
                            if (vh <= 0) vh = GetSystemMetrics(1);

                            _remoteX = Math.Max(vx, Math.Min(vx + vw - 1, _remoteX));
                            _remoteY = Math.Max(vy, Math.Min(vy + vh - 1, _remoteY));

                            SetCursorPos(_remoteX, _remoteY);
                        } else if (sub == "D" || sub == "U") {
                            int btn = int.Parse(parts[2]);
                            bool isDown = (sub == "D");
                            uint flags = 0;
                            int data = 0;

                            if (btn == 1) flags = isDown ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
                            else if (btn == 2) flags = isDown ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
                            else if (btn == 3) flags = isDown ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
                            else if (btn == 4) {
                                flags = isDown ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
                                data = 1;
                            } else if (btn == 5) {
                                flags = isDown ? MOUSEEVENTF_XDOWN : MOUSEEVENTF_XUP;
                                data = 2;
                            }

                            if (flags != 0) {
                                mouse_event(flags, 0, 0, data, UIntPtr.Zero);
                            }
                        } else if (sub == "W" && parts.Length >= 3) {
                            int delta = int.Parse(parts[2]);
                            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, delta, UIntPtr.Zero);
                        } else if (sub == "HW" && parts.Length >= 3) {
                            int delta = int.Parse(parts[2]);
                            mouse_event(MOUSEEVENTF_HWHEEL, 0, 0, delta, UIntPtr.Zero);
                        }
                    } else if (parts[0] == "K" && parts.Length >= 5) {
                        bool isDown = (parts[1] == "D");
                        byte vk = byte.Parse(parts[2]);
                        byte scan = byte.Parse(parts[3]);
                        uint ext = uint.Parse(parts[4]);

                        uint flags = 0;
                        if (!isDown) flags |= KEYEVENTF_KEYUP;
                        if (ext == 1) flags |= KEYEVENTF_EXTENDEDKEY;

                        keybd_event(vk, scan, flags, UIntPtr.Zero);
                    }
                } catch {
                    // Ignore parse errors on malformed input
                }
            }

            ReleaseAll();
            try {
                timeEndPeriod(1);
            } catch {
                // Ignore
            }
            return 0;
        }

        private static void ReleaseAll() {
            // Mouse button releases
            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
            mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
            mouse_event(MOUSEEVENTF_XUP, 0, 0, 1, UIntPtr.Zero);
            mouse_event(MOUSEEVENTF_XUP, 0, 0, 2, UIntPtr.Zero);

            // Modifier key releases
            keybd_event(0x10, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); // Shift
            keybd_event(0x11, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); // Ctrl
            keybd_event(0x12, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); // Alt
            keybd_event(0x5B, 0, KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero); // LWin
            keybd_event(0x5C, 0, KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero); // RWin
        }
    }
}
