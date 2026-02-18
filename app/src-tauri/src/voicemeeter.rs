use libloading::{Library, Symbol};
use std::ffi::CString;
use std::os::raw::{c_char, c_float, c_long};
use std::path::Path;

type FnLogin = unsafe extern "C" fn() -> c_long;
type FnLogout = unsafe extern "C" fn() -> c_long;
type FnSetFloat = unsafe extern "C" fn(*const c_char, c_float) -> c_long;
type FnGetFloat = unsafe extern "C" fn(*const c_char, *mut c_float) -> c_long;
type FnSetString = unsafe extern "C" fn(*const c_char, *const c_char) -> c_long;
type FnGetString = unsafe extern "C" fn(*const c_char, *mut c_char) -> c_long;
type FnIsDirty = unsafe extern "C" fn() -> c_long;
type FnGetLevel = unsafe extern "C" fn(c_long, c_long, *mut c_float) -> c_long;

pub struct VoicemeeterAPI {
    _lib: Library,
    fn_login: FnLogin,
    fn_logout: FnLogout,
    fn_set_float: FnSetFloat,
    fn_get_float: FnGetFloat,
    fn_set_string: FnSetString,
    fn_get_string: FnGetString,
    fn_is_dirty: FnIsDirty,
    fn_get_level: FnGetLevel,
    logged_in: bool,
}

// SAFETY: VoicemeeterAPI wraps a DLL that uses thread-safe COM calls.
// All access is guarded by a Mutex in the Tauri state.
unsafe impl Send for VoicemeeterAPI {}

impl VoicemeeterAPI {
    pub fn new() -> Result<Self, String> {
        let base = Path::new(r"C:\Program Files (x86)\VB\Voicemeeter");
        let dll_name = if std::mem::size_of::<usize>() == 8 {
            "VoicemeeterRemote64.dll"
        } else {
            "VoicemeeterRemote.dll"
        };
        let dll_path = base.join(dll_name);

        if !dll_path.exists() {
            return Err(format!("Voicemeeter DLL not found: {}", dll_path.display()));
        }

        unsafe {
            let lib = Library::new(&dll_path)
                .map_err(|e| format!("Failed to load DLL: {e}"))?;

            let fn_login: Symbol<FnLogin> = lib.get(b"VBVMR_Login")
                .map_err(|e| format!("Missing VBVMR_Login: {e}"))?;
            let fn_logout: Symbol<FnLogout> = lib.get(b"VBVMR_Logout")
                .map_err(|e| format!("Missing VBVMR_Logout: {e}"))?;
            let fn_set_float: Symbol<FnSetFloat> = lib.get(b"VBVMR_SetParameterFloat")
                .map_err(|e| format!("Missing VBVMR_SetParameterFloat: {e}"))?;
            let fn_get_float: Symbol<FnGetFloat> = lib.get(b"VBVMR_GetParameterFloat")
                .map_err(|e| format!("Missing VBVMR_GetParameterFloat: {e}"))?;
            let fn_set_string: Symbol<FnSetString> = lib.get(b"VBVMR_SetParameterStringA")
                .map_err(|e| format!("Missing VBVMR_SetParameterStringA: {e}"))?;
            let fn_get_string: Symbol<FnGetString> = lib.get(b"VBVMR_GetParameterStringA")
                .map_err(|e| format!("Missing VBVMR_GetParameterStringA: {e}"))?;
            let fn_is_dirty: Symbol<FnIsDirty> = lib.get(b"VBVMR_IsParametersDirty")
                .map_err(|e| format!("Missing VBVMR_IsParametersDirty: {e}"))?;
            let fn_get_level: Symbol<FnGetLevel> = lib.get(b"VBVMR_GetLevel")
                .map_err(|e| format!("Missing VBVMR_GetLevel: {e}"))?;

            Ok(Self {
                fn_login: *fn_login,
                fn_logout: *fn_logout,
                fn_set_float: *fn_set_float,
                fn_get_float: *fn_get_float,
                fn_set_string: *fn_set_string,
                fn_get_string: *fn_get_string,
                fn_is_dirty: *fn_is_dirty,
                fn_get_level: *fn_get_level,
                _lib: lib,
                logged_in: false,
            })
        }
    }

    pub fn login(&mut self) -> Result<(), String> {
        let rc = unsafe { (self.fn_login)() };
        if rc >= 0 {
            self.logged_in = true;
            Ok(())
        } else {
            Err(format!("VBVMR_Login failed with code {rc}. Is Voicemeeter Banana running?"))
        }
    }

    pub fn logout(&mut self) {
        if self.logged_in {
            unsafe { (self.fn_logout)() };
            self.logged_in = false;
        }
    }

    pub fn is_dirty(&self) -> Result<bool, String> {
        self.require_login()?;
        let rc = unsafe { (self.fn_is_dirty)() };
        if rc < 0 {
            Err(format!("VBVMR_IsParametersDirty error: {rc}"))
        } else {
            Ok(rc == 1)
        }
    }

    pub fn set_float(&self, param: &str, value: f32) -> Result<(), String> {
        self.require_login()?;
        let param_c = CString::new(param).map_err(|e| e.to_string())?;
        let rc = unsafe { (self.fn_set_float)(param_c.as_ptr(), value) };
        if rc == 0 {
            Ok(())
        } else {
            Err(format!("SetParameterFloat({param}, {value}) failed: {rc}"))
        }
    }

    pub fn get_float(&self, param: &str) -> Result<f32, String> {
        self.require_login()?;
        let param_c = CString::new(param).map_err(|e| e.to_string())?;
        let mut value: c_float = 0.0;
        let rc = unsafe { (self.fn_get_float)(param_c.as_ptr(), &mut value) };
        if rc == 0 {
            Ok(value)
        } else {
            Err(format!("GetParameterFloat({param}) failed: {rc}"))
        }
    }

    pub fn set_string(&self, param: &str, value: &str) -> Result<(), String> {
        self.require_login()?;
        let param_c = CString::new(param).map_err(|e| e.to_string())?;
        let value_c = CString::new(value).map_err(|e| e.to_string())?;
        let rc = unsafe { (self.fn_set_string)(param_c.as_ptr(), value_c.as_ptr()) };
        if rc == 0 {
            Ok(())
        } else {
            Err(format!("SetParameterStringA({param}, {value}) failed: {rc}"))
        }
    }

    pub fn get_string(&self, param: &str) -> Result<String, String> {
        self.require_login()?;
        let param_c = CString::new(param).map_err(|e| e.to_string())?;
        let mut buf = [0u8; 512];
        let rc = unsafe {
            (self.fn_get_string)(param_c.as_ptr(), buf.as_mut_ptr() as *mut c_char)
        };
        if rc == 0 {
            let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
            String::from_utf8(buf[..end].to_vec()).map_err(|e| e.to_string())
        } else {
            Err(format!("GetParameterStringA({param}) failed: {rc}"))
        }
    }

    /// Read audio level from Voicemeeter.
    /// n_type: 0=pre-fader, 1=post-fader, 2=post-mute input, 3=output
    /// n_channel: channel index (strips have L/R pairs)
    pub fn get_level(&self, n_type: i32, n_channel: i32) -> Result<f32, String> {
        self.require_login()?;
        let mut value: c_float = 0.0;
        let rc = unsafe {
            (self.fn_get_level)(n_type as c_long, n_channel as c_long, &mut value)
        };
        if rc == 0 {
            Ok(value)
        } else {
            // -1 or -2 means no data available yet — return silence
            Ok(0.0)
        }
    }

    fn require_login(&self) -> Result<(), String> {
        if self.logged_in {
            Ok(())
        } else {
            Err("Not logged in to Voicemeeter".into())
        }
    }
}

impl Drop for VoicemeeterAPI {
    fn drop(&mut self) {
        self.logout();
    }
}
