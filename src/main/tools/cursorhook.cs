using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace SudoLaunch {
    class CursorHook {
        private const int WH_MOUSE_LL = 14;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_RBUTTONUP = 0x0205;
        private const int WM_QUIT = 0x0012;

        private const int VK_CONTROL = 0x11;
        private const int VK_LCONTROL = 0xA2;
        private const int VK_RCONTROL = 0xA3;

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
        private struct MSG {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public POINT pt;
        }

        private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("kernel32.dll")]
        private static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        private static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

        [DllImport("user32.dll")]
        private static extern bool TranslateMessage(ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern IntPtr DispatchMessage(ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern bool PostThreadMessage(uint idThread, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        private static HookProc _hookProc;
        private static IntPtr _hookId = IntPtr.Zero;
        private static uint _mainThreadId = 0;
        private static bool _suppressNextRBtnUp = false;

        private static IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
            if (nCode >= 0) {
                int msg = wParam.ToInt32();
                if (msg == WM_RBUTTONDOWN) {
                    bool ctrlPressed = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0
                                    || (GetAsyncKeyState(VK_LCONTROL) & 0x8000) != 0
                                    || (GetAsyncKeyState(VK_RCONTROL) & 0x8000) != 0;
                    if (ctrlPressed) {
                        _suppressNextRBtnUp = true;
                        try {
                            MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                            Console.WriteLine("CTRL_RIGHT_CLICK " + hookStruct.pt.x + " " + hookStruct.pt.y);
                            Console.Out.Flush();
                        } catch {
                            // ignore marshal errors
                        }
                        return (IntPtr)1; // Suppress Windows context menu
                    }
                } else if (msg == WM_RBUTTONUP) {
                    if (_suppressNextRBtnUp) {
                        _suppressNextRBtnUp = false;
                        return (IntPtr)1; // Suppress matching mouse up
                    }
                }
            }
            return CallNextHookEx(_hookId, nCode, wParam, lParam);
        }

        static void Main(string[] args) {
            _mainThreadId = GetCurrentThreadId();
            _hookProc = MouseHookCallback;

            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule) {
                _hookId = SetWindowsHookEx(WH_MOUSE_LL, _hookProc, GetModuleHandle(curModule.ModuleName), 0);
            }

            if (_hookId == IntPtr.Zero) {
                Console.Error.WriteLine("ERROR:FAILED_TO_SET_HOOK");
                return;
            }

            Console.WriteLine("HOOK_READY");
            Console.Out.Flush();

            Thread readerThread = new Thread(() => {
                try {
                    while (true) {
                        string line = Console.ReadLine();
                        if (line == null || line.Trim().Equals("quit", StringComparison.OrdinalIgnoreCase)) {
                            break;
                        }
                    }
                } catch {
                    // stream closed
                }
                PostThreadMessage(_mainThreadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
            });
            readerThread.IsBackground = true;
            readerThread.Start();

            MSG msg;
            while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }

            if (_hookId != IntPtr.Zero) {
                UnhookWindowsHookEx(_hookId);
                _hookId = IntPtr.Zero;
            }
        }
    }
}
