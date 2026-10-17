var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express6 = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_http = __toESM(require("http"), 1);
var import_child_process = require("child_process");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_vite = require("vite");

// server/api/adminUsers.ts
var import_express = __toESM(require("express"), 1);
var import_supabase_js = require("@supabase/supabase-js");
var adminUserRouter = import_express.default.Router();
function getSupabaseAdminClient() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!supabaseUrl) {
    return { error: "SUPABASE_URL (or VITE_SUPABASE_URL) is not configured on the server." };
  }
  if (!serviceRoleKey) {
    return {
      error: "SUPABASE_SERVICE_ROLE_KEY environment variable is missing on the server. Please add your Supabase Service Role Key to the server environment variables."
    };
  }
  const client = (0, import_supabase_js.createClient)(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return { client };
}
async function authenticateAdmin(req, supabaseAdmin) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: {
        status: 401,
        message: "Authorization header with Bearer token is required."
      }
    };
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return {
      error: {
        status: 401,
        message: "Empty authentication token provided."
      }
    };
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return {
      error: {
        status: 401,
        message: "Invalid or expired authentication session. Please log in again."
      }
    };
  }
  const callerUser = userData.user;
  const { data: profileRow } = await supabaseAdmin.from("profiles").select("id, role, status").eq("id", callerUser.id).maybeSingle();
  const callerRole = String(
    profileRow?.role || callerUser.user_metadata?.role || ""
  ).toUpperCase();
  if (callerRole !== "ADMIN") {
    return {
      error: {
        status: 403,
        message: "Access Denied: Only users with the ADMIN role can perform this operation."
      }
    };
  }
  return { userId: callerUser.id };
}
adminUserRouter.post("/create-user", async (req, res) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || "Supabase admin client initialization failed.",
        code: "MISSING_SERVICE_ROLE_KEY"
      });
    }
    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message
      });
    }
    const { fullName, email, phone, role, password, status } = req.body || {};
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please provide full name."
      });
    }
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please provide email / user ID."
      });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid email address."
      });
    }
    const rawRole = String(role || "nurse").trim().toUpperCase();
    const allowedRoles = ["ADMIN", "NURSE", "SPECIALIST"];
    if (!allowedRoles.includes(rawRole)) {
      return res.status(400).json({
        success: false,
        error: "Invalid role specified. Allowed roles: Admin, Nurse, Specialist."
      });
    }
    const initialPassword = typeof password === "string" && password.trim().length > 0 ? password.trim() : "password";
    if (initialPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long."
      });
    }
    const { data: existingProfile } = await supabaseAdmin.from("profiles").select("id, email").ilike("email", trimmedEmail).maybeSingle();
    if (existingProfile) {
      return res.status(409).json({
        success: false,
        error: `A user account with email "${trimmedEmail}" already exists in the system.`,
        code: "USER_EXISTS"
      });
    }
    const { data: createdAuth, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        name: fullName.trim(),
        phone: phone ? String(phone).trim() : "",
        role: rawRole,
        status: status || "Active"
      }
    });
    if (authError || !createdAuth?.user) {
      const msg = authError?.message || "Authentication user creation failed.";
      const isDuplicate = msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists") || msg.toLowerCase().includes("unique");
      return res.status(isDuplicate ? 409 : 400).json({
        success: false,
        error: isDuplicate ? `A user with email "${trimmedEmail}" already exists in Supabase Authentication.` : msg,
        code: isDuplicate ? "USER_EXISTS" : "AUTH_CREATION_FAILED"
      });
    }
    const newUserId = createdAuth.user.id;
    const isInactive = String(status || "").toUpperCase() === "INACTIVE" || status === "Inactive";
    const newProfileRecord = {
      id: newUserId,
      full_name: fullName.trim(),
      email: trimmedEmail,
      phone: phone ? String(phone).trim() : null,
      role: rawRole,
      status: isInactive ? "INACTIVE" : "ACTIVE",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { error: profileInsertError } = await supabaseAdmin.from("profiles").insert([newProfileRecord]);
    if (profileInsertError) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUserId);
      } catch (rollbackErr) {
        console.error("Failed to rollback auth.users after profile insertion failure:", rollbackErr);
      }
      return res.status(500).json({
        success: false,
        error: `Failed to create user record in public.profiles: ${profileInsertError.message}. Authentication record was safely rolled back.`,
        code: "PROFILE_CREATION_FAILED"
      });
    }
    let title = "Primary Healthcare Worker";
    if (rawRole === "ADMIN") title = "Hospital System Administrator";
    if (rawRole === "SPECIALIST") title = "Consultant Ophthalmologist";
    return res.status(201).json({
      success: true,
      user: {
        id: newUserId,
        name: fullName.trim(),
        email: trimmedEmail,
        role: rawRole.toLowerCase(),
        title,
        phone: phone ? String(phone).trim() : "",
        status: status === "Inactive" ? "Inactive" : "Active",
        createdAt: (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }),
        avatarLetter: fullName.trim().charAt(0).toUpperCase() || "U"
      },
      message: `User account for ${fullName.trim()} created successfully!`
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || "Unknown error"}`
    });
  }
});
adminUserRouter.get("/users", async (req, res) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || "Supabase admin client initialization failed.",
        code: "MISSING_SERVICE_ROLE_KEY"
      });
    }
    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message
      });
    }
    const { data: profiles, error: selectError } = await supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false });
    if (selectError) {
      return res.status(500).json({
        success: false,
        error: `Failed to query profiles: ${selectError.message}`
      });
    }
    const formattedUsers = (profiles || []).map((p) => {
      const rawRole = String(p.role || "nurse").toLowerCase();
      let title = "Primary Healthcare Worker";
      if (rawRole === "admin") title = "Hospital System Administrator";
      if (rawRole === "specialist") title = "Consultant Ophthalmologist";
      const name = p.full_name || p.email?.split("@")[0] || "User";
      const isInactive = String(p.status || "").toUpperCase() === "INACTIVE";
      return {
        id: p.id,
        name,
        email: p.email,
        role: rawRole,
        title,
        phone: p.phone || "",
        status: isInactive ? "Inactive" : "Active",
        createdAt: p.created_at ? new Date(p.created_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }) : "Recent",
        avatarLetter: name.charAt(0).toUpperCase() || "U"
      };
    });
    return res.json({ success: true, users: formattedUsers });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || "Unknown error"}`
    });
  }
});
adminUserRouter.patch("/users/:id/status", async (req, res) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || "Supabase admin client initialization failed.",
        code: "MISSING_SERVICE_ROLE_KEY"
      });
    }
    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message
      });
    }
    const { id } = req.params;
    const { status } = req.body || {};
    if (!["Active", "Inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be "Active" or "Inactive".'
      });
    }
    const dbStatus = status === "Inactive" ? "INACTIVE" : "ACTIVE";
    const { error: updateError } = await supabaseAdmin.from("profiles").update({ status: dbStatus }).eq("id", id);
    if (updateError) {
      return res.status(500).json({
        success: false,
        error: `Failed to update user status: ${updateError.message}`
      });
    }
    return res.json({ success: true, id, status });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || "Unknown error"}`
    });
  }
});
adminUserRouter.delete("/users/:id", async (req, res) => {
  try {
    const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient();
    if (clientError || !supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: clientError || "Supabase admin client initialization failed.",
        code: "MISSING_SERVICE_ROLE_KEY"
      });
    }
    const authResult = await authenticateAdmin(req, supabaseAdmin);
    if (authResult.error) {
      return res.status(authResult.error.status).json({
        success: false,
        error: authResult.error.message
      });
    }
    const { id } = req.params;
    if (!id || !id.trim()) {
      return res.status(400).json({
        success: false,
        error: "Target user ID is required."
      });
    }
    const trimmedId = id.trim();
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmedId);
    let targetAuthUser = null;
    if (isUUID) {
      try {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(trimmedId);
        if (!error && data) {
          targetAuthUser = data;
        }
      } catch (authErr) {
        console.warn("[Admin API] getUserById exception:", authErr);
      }
    }
    let profileCheck = null;
    if (isUUID) {
      const { data } = await supabaseAdmin.from("profiles").select("id, email, full_name, role").eq("id", trimmedId).maybeSingle();
      profileCheck = data;
    } else {
      const { data } = await supabaseAdmin.from("profiles").select("id, email, full_name, role").eq("email", trimmedId.toLowerCase()).maybeSingle();
      profileCheck = data;
    }
    const targetUserId = profileCheck?.id || targetAuthUser?.user?.id || trimmedId;
    const targetEmail = (targetAuthUser?.user?.email || profileCheck?.email || "").toLowerCase();
    if (authResult.userId?.toLowerCase() === targetUserId?.toLowerCase() || authResult.userId?.toLowerCase() === trimmedId.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: "You cannot delete your own account."
      });
    }
    if (!targetAuthUser?.user && !profileCheck) {
      return res.status(404).json({
        success: false,
        error: "User not found or has already been deleted."
      });
    }
    const { data: userScreenings } = await supabaseAdmin.from("screenings").select("id").eq("nurse_id", targetUserId);
    const screeningIds = (userScreenings || []).map((s) => s.id);
    if (screeningIds.length > 0) {
      await supabaseAdmin.from("screening_findings").delete().in("screening_id", screeningIds);
      await supabaseAdmin.from("screening_evidence").delete().in("screening_id", screeningIds);
      await supabaseAdmin.from("reports").delete().in("screening_id", screeningIds);
      await supabaseAdmin.from("specialist_reviews").delete().in("screening_id", screeningIds);
      await supabaseAdmin.from("referrals").delete().in("screening_id", screeningIds);
      await supabaseAdmin.from("screenings").delete().in("id", screeningIds);
    }
    await supabaseAdmin.from("specialist_reviews").delete().eq("specialist_id", targetUserId);
    await supabaseAdmin.from("referrals").delete().eq("specialist_id", targetUserId);
    await supabaseAdmin.from("referrals").delete().eq("nurse_id", targetUserId);
    await supabaseAdmin.from("reports").delete().eq("generated_by", targetUserId);
    const { data: userPatients } = await supabaseAdmin.from("patients").select("id").eq("created_by", targetUserId);
    const patientIds = (userPatients || []).map((p) => p.id);
    if (patientIds.length > 0) {
      const { data: patientScreenings } = await supabaseAdmin.from("screenings").select("id").in("patient_id", patientIds);
      const pScreeningIds = (patientScreenings || []).map((s) => s.id);
      if (pScreeningIds.length > 0) {
        await supabaseAdmin.from("screening_findings").delete().in("screening_id", pScreeningIds);
        await supabaseAdmin.from("screening_evidence").delete().in("screening_id", pScreeningIds);
        await supabaseAdmin.from("reports").delete().in("screening_id", pScreeningIds);
        await supabaseAdmin.from("specialist_reviews").delete().in("screening_id", pScreeningIds);
        await supabaseAdmin.from("referrals").delete().in("screening_id", pScreeningIds);
        await supabaseAdmin.from("screenings").delete().in("id", pScreeningIds);
      }
      await supabaseAdmin.from("patients").delete().in("id", patientIds);
    }
    const { error: profileDeleteError } = await supabaseAdmin.from("profiles").delete().eq("id", targetUserId);
    if (profileDeleteError) {
      console.error("[Delete User] Error deleting profile:", profileDeleteError);
    }
    const authIdToDelete = targetAuthUser?.user?.id || (isUUID ? targetUserId : null);
    if (authIdToDelete) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authIdToDelete);
      if (authDeleteError && !authDeleteError.message?.toLowerCase().includes("not found")) {
        return res.status(500).json({
          success: false,
          error: `Failed to delete authentication user: ${authDeleteError.message}`
        });
      }
    }
    return res.json({
      success: true,
      message: `User ${profileCheck?.full_name || targetEmail || targetUserId} and all associated records permanently deleted.`,
      deletedId: targetUserId
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Internal server error: ${err?.message || "Unknown error"}`
    });
  }
});

// server/api/patientService.ts
var import_express2 = __toESM(require("express"), 1);
var import_supabase_js2 = require("@supabase/supabase-js");
var patientRouter = import_express2.default.Router();
function getSupabaseAdminClient2() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!supabaseUrl) {
    return { error: "SUPABASE_URL is not configured on the server." };
  }
  if (!serviceRoleKey) {
    return {
      error: "SUPABASE_SERVICE_ROLE_KEY environment variable is missing on the server."
    };
  }
  const client = (0, import_supabase_js2.createClient)(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return { client };
}
async function authenticateCaller(req, supabaseAdmin) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: {
        status: 401,
        message: "Authorization header with Bearer token is required."
      }
    };
  }
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return {
      error: {
        status: 401,
        message: "Empty authentication token provided."
      }
    };
  }
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return {
      error: {
        status: 401,
        message: "Invalid or expired authentication session. Please log in again."
      }
    };
  }
  const callerUser = userData.user;
  const { data: profileRow } = await supabaseAdmin.from("profiles").select("id, role, status, email").eq("id", callerUser.id).maybeSingle();
  const rawRole = String(
    profileRow?.role || callerUser.user_metadata?.role || ""
  ).toUpperCase();
  const role = rawRole === "ADMIN" ? "ADMIN" : rawRole === "SPECIALIST" ? "SPECIALIST" : "NURSE";
  return {
    user: {
      id: callerUser.id,
      email: callerUser.email,
      role
    }
  };
}
patientRouter.delete("/:id", async (req, res) => {
  const patientParamId = req.params.id?.trim();
  if (!patientParamId) {
    return res.status(400).json({
      success: false,
      error: "Patient identifier is required."
    });
  }
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient2();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({
      success: false,
      error: clientError || "Database configuration error."
    });
  }
  const auth = await authenticateCaller(req, supabaseAdmin);
  if (auth.error || !auth.user) {
    return res.status(auth.error?.status || 401).json({
      success: false,
      error: auth.error?.message || "Authentication required."
    });
  }
  const caller = auth.user;
  if (caller.role === "SPECIALIST") {
    return res.status(403).json({
      success: false,
      error: "Access Denied: Specialists are not authorized to delete patient records."
    });
  }
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientParamId);
    let patientQuery = supabaseAdmin.from("patients").select("*");
    if (isUuid) {
      patientQuery = patientQuery.or(`id.eq.${patientParamId},patient_id.eq.${patientParamId}`);
    } else {
      patientQuery = patientQuery.eq("patient_id", patientParamId);
    }
    const { data: patientRow, error: findError } = await patientQuery.maybeSingle();
    if (findError) {
      console.error("[Delete Patient] Error locating patient:", findError);
      return res.status(500).json({
        success: false,
        error: `Database error querying patient: ${findError.message}`
      });
    }
    if (patientRow) {
      if (caller.role === "NURSE") {
        const isCreator = !patientRow.created_by || patientRow.created_by === caller.id;
        if (!isCreator) {
          const { data: nurseScreening } = await supabaseAdmin.from("screenings").select("id").eq("patient_id", patientRow.id).eq("nurse_id", caller.id).limit(1);
          if (!nurseScreening || nurseScreening.length === 0) {
            return res.status(403).json({
              success: false,
              error: "Access Denied: You are not authorized to delete this patient record."
            });
          }
        }
      }
      const patientDbId = patientRow.id;
      const { data: patientScreenings, error: screenErr } = await supabaseAdmin.from("screenings").select("id").eq("patient_id", patientDbId);
      if (screenErr) {
        console.error("[Delete Patient] Error querying screenings:", screenErr);
      }
      const screeningIds = (patientScreenings || []).map((s) => s.id);
      if (screeningIds.length > 0) {
        const { error: fErr } = await supabaseAdmin.from("screening_findings").delete().in("screening_id", screeningIds);
        if (fErr) console.error("[Delete Patient] Error deleting findings:", fErr);
        const { error: eErr } = await supabaseAdmin.from("screening_evidence").delete().in("screening_id", screeningIds);
        if (eErr) console.error("[Delete Patient] Error deleting evidence:", eErr);
        const { error: rptScreenErr } = await supabaseAdmin.from("reports").delete().in("screening_id", screeningIds);
        if (rptScreenErr) console.error("[Delete Patient] Error deleting reports by screening:", rptScreenErr);
        const { error: revScreenErr } = await supabaseAdmin.from("specialist_reviews").delete().in("screening_id", screeningIds);
        if (revScreenErr) console.error("[Delete Patient] Error deleting reviews by screening:", revScreenErr);
        const { error: refScreenErr } = await supabaseAdmin.from("referrals").delete().in("screening_id", screeningIds);
        if (refScreenErr) console.error("[Delete Patient] Error deleting referrals by screening:", refScreenErr);
        const { error: scrErr } = await supabaseAdmin.from("screenings").delete().in("id", screeningIds);
        if (scrErr) console.error("[Delete Patient] Error deleting screenings:", scrErr);
      }
      const { error: rptPatErr } = await supabaseAdmin.from("reports").delete().eq("patient_id", patientDbId);
      if (rptPatErr) console.error("[Delete Patient] Error deleting reports by patient:", rptPatErr);
      const { error: revPatErr } = await supabaseAdmin.from("specialist_reviews").delete().eq("patient_id", patientDbId);
      if (revPatErr) console.error("[Delete Patient] Error deleting reviews by patient:", revPatErr);
      const { error: refPatErr } = await supabaseAdmin.from("referrals").delete().eq("patient_id", patientDbId);
      if (refPatErr) console.error("[Delete Patient] Error deleting referrals by patient:", refPatErr);
      const { error: pDelErr } = await supabaseAdmin.from("patients").delete().eq("id", patientDbId);
      if (pDelErr) {
        console.error("[Delete Patient] Error deleting patient row:", pDelErr);
        return res.status(500).json({
          success: false,
          error: `Failed to delete patient row: ${pDelErr.message}`
        });
      }
      console.log(`[Delete Patient] Successfully purged patient ${patientRow.patient_id} (${patientDbId}) and all child records.`);
    }
    return res.json({
      success: true,
      message: "Patient and all associated records permanently deleted.",
      deletedId: patientParamId
    });
  } catch (err) {
    console.error("[Delete Patient] Unexpected exception:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "An unexpected error occurred during patient deletion."
    });
  }
});
patientRouter.post("/", async (req, res) => {
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient2();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({
      success: false,
      error: clientError || "Database configuration error."
    });
  }
  let creatorId = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      try {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (userData?.user?.id) {
          creatorId = userData.user.id;
        }
      } catch (authErr) {
        console.warn("[Patient Router POST] Token verification warning:", authErr);
      }
    }
  }
  const {
    patientId,
    name,
    age,
    gender,
    phone,
    diabetesDuration,
    knownDR
  } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      error: "Patient name is required."
    });
  }
  const finalPatientCode = patientId && patientId.trim() || `PX-${Date.now().toString().slice(-4)}`;
  try {
    const { data: existingPatient } = await supabaseAdmin.from("patients").select("*").eq("patient_id", finalPatientCode).maybeSingle();
    if (existingPatient) {
      console.log(`[Patient Service] Patient ${finalPatientCode} already exists in database.`);
      return res.json({
        success: true,
        patient: existingPatient
      });
    }
    const insertPayload = {
      patient_id: finalPatientCode,
      name: name.trim(),
      age: Number(age) || 45,
      gender: gender || "Male",
      phone: phone || "",
      diabetes_duration: Number(diabetesDuration) || 0,
      known_dr: Boolean(knownDR)
    };
    if (creatorId) {
      insertPayload.created_by = creatorId;
    }
    let { data: insertedPatient, error: insertError } = await supabaseAdmin.from("patients").insert([insertPayload]).select().single();
    if (insertError && creatorId && insertError.code === "23503") {
      console.warn("[Patient Service] created_by foreign key not present in auth.users, retrying with null created_by");
      delete insertPayload.created_by;
      const retry = await supabaseAdmin.from("patients").insert([insertPayload]).select().single();
      insertedPatient = retry.data;
      insertError = retry.error;
    }
    if (insertError || !insertedPatient) {
      console.error("[Patient Service] Error inserting patient:", insertError);
      return res.status(500).json({
        success: false,
        error: insertError?.message || "Failed to save patient to database."
      });
    }
    console.log(`[Patient Service] Successfully persisted patient ${insertedPatient.patient_id} (UUID: ${insertedPatient.id}) to Supabase.`);
    return res.json({
      success: true,
      patient: insertedPatient
    });
  } catch (err) {
    console.error("[Patient Service] Exception in POST /api/patients:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to create patient."
    });
  }
});
patientRouter.get("/", async (_req, res) => {
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient2();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({
      success: false,
      error: clientError || "Database configuration error."
    });
  }
  try {
    const { data: patientsList, error: pErr } = await supabaseAdmin.from("patients").select("*").order("created_at", { ascending: false });
    if (pErr) {
      console.error("[Patient Service] Error fetching patients:", pErr);
      return res.status(500).json({
        success: false,
        error: pErr.message
      });
    }
    return res.json({
      success: true,
      patients: patientsList || []
    });
  } catch (err) {
    console.error("[Patient Service] Exception in GET /api/patients:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// server/api/authService.ts
var import_express3 = require("express");
var import_supabase_js3 = require("@supabase/supabase-js");
var authRouter = (0, import_express3.Router)();
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || url.includes("placeholder") || serviceRoleKey.includes("PASTE_YOUR") || serviceRoleKey.includes("placeholder")) {
    return null;
  }
  try {
    return (0, import_supabase_js3.createClient)(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  } catch {
    return null;
  }
}
authRouter.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
      return res.status(400).json({ success: false, error: "Email or User ID is required." });
    }
    if (!password || typeof password !== "string" || !password.trim()) {
      return res.status(400).json({ success: false, error: "Password is required." });
    }
    const trimmedInput = identifier.trim().toLowerCase();
    const inputPass = password.trim();
    const supabaseAdmin = getSupabaseAdmin();
    const anonUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
    const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
    if (!anonUrl || !anonKey) {
      return res.status(503).json({
        success: false,
        error: "Authentication database service unavailable."
      });
    }
    let targetEmail = trimmedInput;
    if (!targetEmail.includes("@")) {
      if (supabaseAdmin) {
        const { data: profile } = await supabaseAdmin.from("profiles").select("email").or(`email.ilike.${trimmedInput}@%,id.eq.${trimmedInput},full_name.ilike.${trimmedInput}`).maybeSingle();
        const profileRecord = profile;
        if (profileRecord?.email) {
          targetEmail = profileRecord.email.toLowerCase();
        } else {
          targetEmail = `${trimmedInput}@gmail.com`;
        }
      } else {
        targetEmail = `${trimmedInput}@gmail.com`;
      }
    }
    const authClient = (0, import_supabase_js3.createClient)(anonUrl, anonKey);
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: targetEmail,
      password: inputPass
    });
    if (authError || !authData?.user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email/user ID or password."
      });
    }
    if (supabaseAdmin) {
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail
      });
      if (!linkErr && linkData?.properties?.hashed_token) {
        return res.json({
          success: true,
          email: targetEmail,
          token_hash: linkData.properties.hashed_token,
          session: authData.session
        });
      }
    }
    return res.json({
      success: true,
      email: targetEmail,
      session: authData.session
    });
  } catch (err) {
    console.error("[Auth Service Exception]", err);
    return res.status(500).json({
      success: false,
      error: "An internal error occurred during authentication. Please try again."
    });
  }
});

// server/api/mlService.ts
var import_express5 = require("express");
var http = __toESM(require("http"), 1);
var https = __toESM(require("https"), 1);

// server/api/screeningService.ts
var import_express4 = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_supabase_js4 = require("@supabase/supabase-js");
var screeningRouter = import_express4.default.Router();
var STORAGE_BUCKET = "medical-screenings";
function getSupabaseAdminClient3() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
  if (!supabaseUrl) {
    return { error: "SUPABASE_URL is not configured on the server." };
  }
  if (!serviceRoleKey) {
    return {
      error: "SUPABASE_SERVICE_ROLE_KEY environment variable is missing on the server."
    };
  }
  const client = (0, import_supabase_js4.createClient)(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return { client };
}
async function resolvePatientDbId(supabaseAdmin, patientIdentifier, doctorId, patientMeta) {
  const cleanId = (patientIdentifier || "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  if (isUuid) {
    const { data: existing } = await supabaseAdmin.from("patients").select("id").eq("id", cleanId).maybeSingle();
    if (existing?.id) return existing.id;
  }
  if (cleanId) {
    const { data: existingByCode } = await supabaseAdmin.from("patients").select("id").eq("patient_id", cleanId).maybeSingle();
    if (existingByCode?.id) return existingByCode.id;
  }
  const { data: firstPatient } = await supabaseAdmin.from("patients").select("id").limit(1).maybeSingle();
  if (firstPatient?.id && !cleanId) {
    return firstPatient.id;
  }
  const newCode = cleanId || `PX-${Math.floor(1e3 + Math.random() * 9e3)}`;
  const { data: createdPatient, error: createErr } = await supabaseAdmin.from("patients").insert({
    patient_id: newCode,
    name: patientMeta?.name || "Patient information unavailable",
    age: patientMeta?.age || 55,
    gender: patientMeta?.gender || "Other",
    phone: patientMeta?.phone || "",
    created_by: doctorId
  }).select("id").single();
  if (createErr || !createdPatient) {
    console.error("[Screening Service] Failed to create patient record:", createErr);
    if (firstPatient?.id) return firstPatient.id;
    throw new Error(`Failed to resolve or create patient: ${createErr?.message}`);
  }
  return createdPatient.id;
}
async function persistGlaucomaScreening(supabaseAdmin, doctorId, patientDbId, eyeSide, mlResult) {
  const { data: sessionRow, error: sessionErr } = await supabaseAdmin.from("screening_sessions").insert({
    doctor_id: doctorId,
    patient_id: patientDbId,
    screening_type: "glaucoma",
    eye_side: eyeSide || "Right Eye",
    status: "in_progress",
    started_at: (/* @__PURE__ */ new Date()).toISOString()
  }).select("*").single();
  if (sessionErr || !sessionRow) {
    console.error("[Screening Service] Error inserting screening_sessions:", sessionErr);
    throw new Error(`Database error creating screening session: ${sessionErr?.message}`);
  }
  const sessionId = sessionRow.id;
  const signedArtifacts = {};
  const artifactMapping = [
    {
      artifactType: "original_fundus",
      base64Data: mlResult.visualizations?.original,
      keyName: "original"
    },
    {
      artifactType: "optic_disc_cup",
      base64Data: mlResult.visualizations?.opticNerve,
      keyName: "opticNerve"
    },
    {
      artifactType: "vessel_segmentation",
      base64Data: mlResult.visualizations?.retinalAnatomy,
      keyName: "retinalAnatomy"
    },
    {
      artifactType: "gradcam",
      base64Data: mlResult.visualizations?.gradcam,
      keyName: "gradcam"
    },
    {
      artifactType: "combined_xai",
      base64Data: mlResult.visualizations?.workflow,
      keyName: "workflow"
    }
  ];
  const localTargetDir = import_path.default.join(process.cwd(), "uploads", "screening_results", sessionId);
  try {
    import_fs.default.mkdirSync(localTargetDir, { recursive: true });
  } catch {
  }
  await Promise.all(
    artifactMapping.map(async (item) => {
      if (!item.base64Data) return;
      try {
        let rawB64 = item.base64Data;
        if (rawB64.includes(",")) {
          rawB64 = rawB64.split(",")[1];
        }
        const buffer = Buffer.from(rawB64, "base64");
        try {
          import_fs.default.writeFileSync(import_path.default.join(localTargetDir, `${item.artifactType}.png`), buffer);
          if (item.keyName !== item.artifactType) {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, `${item.keyName}.png`), buffer);
          }
          if (item.artifactType === "original_fundus") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "original.png"), buffer);
          }
          if (item.artifactType === "optic_disc_cup") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "optic_nerve.png"), buffer);
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "opticNerve.png"), buffer);
          }
          if (item.artifactType === "vessel_segmentation") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "vessels.png"), buffer);
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "retinalAnatomy.png"), buffer);
          }
          if (item.artifactType === "gradcam") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "gradcam.png"), buffer);
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "xai.png"), buffer);
          }
          if (item.artifactType === "combined_xai") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "workflow.png"), buffer);
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "combined.png"), buffer);
          }
        } catch (diskErr) {
          console.warn(`[Screening Service] Local disk write warning for ${item.artifactType}:`, diskErr);
        }
        signedArtifacts[item.keyName] = `/api/screenings/${sessionId}/artifacts/${item.keyName}`;
        signedArtifacts[item.artifactType] = `/api/screenings/${sessionId}/artifacts/${item.artifactType}`;
        const storagePath = `${doctorId}/${patientDbId}/${sessionId}/${item.artifactType}.png`;
        const { error: uploadErr } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
          contentType: "image/png",
          upsert: true
        });
        if (uploadErr) {
          console.warn(`[Screening Service] Warning uploading artifact ${item.artifactType}:`, uploadErr.message);
        }
        const { error: artDbErr } = await supabaseAdmin.from("screening_artifacts").insert({
          screening_session_id: sessionId,
          doctor_id: doctorId,
          patient_id: patientDbId,
          artifact_type: item.artifactType,
          bucket_id: STORAGE_BUCKET,
          storage_path: storagePath,
          mime_type: "image/png",
          file_size_bytes: buffer.length,
          eye_side: eyeSide || "Right Eye"
        });
        if (artDbErr) {
          console.warn(`[Screening Service] Warning recording artifact row ${item.artifactType}:`, artDbErr.message);
        }
        const { data: signedData } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 86400);
        if (signedData?.signedUrl) {
          signedArtifacts[item.keyName] = signedData.signedUrl;
          signedArtifacts[item.artifactType] = signedData.signedUrl;
        }
      } catch (e) {
        console.error(`[Screening Service] Error processing artifact ${item.artifactType}:`, e);
      }
    })
  );
  const isUngradable = mlResult.status === "IMAGE_QUALITY_INSUFFICIENT" || mlResult.status === "SEGMENTATION_UNGRADABLE" || mlResult.status === "INCONCLUSIVE" || mlResult.glaucoma?.prediction === "INCONCLUSIVE" || mlResult.glaucoma?.prediction === "UNGRADABLE";
  const isSuspect = !isUngradable && Boolean(mlResult.glaucoma?.glaucomaFlag || mlResult.glaucoma?.prediction === "GLAUCOMA_SUSPECT");
  const probability = mlResult.glaucoma?.glaucomaProbability || 0;
  const quality = mlResult.quality?.quality || "Good";
  const measurements = {
    vertical_cdr: mlResult.discCupSegmentation?.verticalCDR || 0,
    horizontal_cdr: mlResult.discCupSegmentation?.horizontalCDR || 0,
    area_cdr: mlResult.discCupSegmentation?.areaCDR || 0,
    cdr_features: mlResult.discCupSegmentation?.cdrFeatures || {},
    vessel_density: mlResult.vesselSegmentation?.density || 0,
    quality_features: mlResult.quality?.features || {}
  };
  const modelOutput = {
    glaucoma: mlResult.glaucoma || {},
    discCupSegmentation: mlResult.discCupSegmentation || {},
    vesselSegmentation: mlResult.vesselSegmentation || {},
    quality: mlResult.quality || {}
  };
  const clinicalSummary = mlResult.glaucoma?.clinicalRecommendation || (isUngradable ? "Automated glaucoma screening inconclusive due to ungradable segmentation. Specialist examination advised." : isSuspect ? "Elevated cup-to-disc ratio detected. Dilated ophthalmological examination recommended." : "Optic nerve head morphology within normal physiologic parameters.");
  const recommendations = {
    triage: isUngradable ? "Specialist Evaluation Required" : isSuspect ? "Refer to Specialist / Glaucoma Clinic" : "Annual Routine Screening",
    follow_up_period: isUngradable ? "1-2 weeks" : isSuspect ? "2-4 weeks" : "12 months",
    referral_required: isUngradable || isSuspect
  };
  const { data: resultRow, error: resultErr } = await supabaseAdmin.from("screening_results").insert({
    screening_session_id: sessionId,
    doctor_id: doctorId,
    patient_id: patientDbId,
    screening_type: "glaucoma",
    verdict: isUngradable ? "INCONCLUSIVE" : isSuspect ? "GLAUCOMA_SUSPECT" : "NORMAL",
    probability,
    severity: isUngradable ? "inconclusive" : isSuspect ? "suspect" : "normal",
    image_quality: quality,
    measurements,
    model_output: modelOutput,
    model_name: "Attention U-Net + Random Forest Glaucoma Pipeline",
    model_version: "1.0.0",
    clinical_summary: clinicalSummary,
    recommendations,
    review_status: "pending_review"
  }).select("*").single();
  if (resultErr) {
    console.error("[Screening Service] Error inserting screening_results:", resultErr);
  }
  await supabaseAdmin.from("screening_sessions").update({
    status: "completed",
    completed_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", sessionId);
  return {
    sessionId,
    signedArtifacts,
    screeningRecord: {
      session: sessionRow,
      result: resultRow
    }
  };
}
async function persistDRScreening(supabaseAdmin, doctorId, patientDbId, eyeSide, mlResult) {
  const { data: sessionRow, error: sessionErr } = await supabaseAdmin.from("screening_sessions").insert({
    doctor_id: doctorId,
    patient_id: patientDbId,
    screening_type: "dr",
    eye_side: eyeSide || "Right Eye",
    status: "in_progress",
    started_at: (/* @__PURE__ */ new Date()).toISOString()
  }).select("*").single();
  if (sessionErr || !sessionRow) {
    console.error("[Screening Service] Error inserting screening_sessions (DR):", sessionErr);
    throw new Error(`Database error creating screening session: ${sessionErr?.message}`);
  }
  const sessionId = sessionRow.id;
  const signedArtifacts = {};
  const drVisualizations = mlResult.trinay?.visualizations || {};
  const drXai = mlResult.xai || {};
  const artifactMapping = [
    {
      artifactType: "original_fundus",
      base64Data: drVisualizations.canonical || drXai.original || (typeof mlResult.imageOriginal === "string" ? mlResult.imageOriginal : void 0),
      keyName: "original"
    },
    {
      artifactType: "lesion_overlay",
      base64Data: drVisualizations.lesion,
      keyName: "lesions"
    },
    {
      artifactType: "anatomy_map",
      base64Data: drVisualizations.anatomy,
      keyName: "anatomy"
    },
    {
      artifactType: "combined_xai",
      base64Data: drVisualizations.combined,
      keyName: "combined"
    },
    {
      artifactType: "gradcam",
      base64Data: drXai.combined,
      keyName: "gradcam"
    },
    {
      artifactType: "optic_disc_cup",
      base64Data: drXai.optic_disc,
      keyName: "optic_disc"
    },
    {
      artifactType: "vessel_segmentation",
      base64Data: drXai.vessel,
      keyName: "vessel"
    }
  ];
  await Promise.all(
    artifactMapping.map(async (item) => {
      if (!item.base64Data) return;
      try {
        let rawB64 = item.base64Data;
        if (rawB64.includes(",")) {
          rawB64 = rawB64.split(",")[1];
        }
        const buffer = Buffer.from(rawB64, "base64");
        const storagePath = `${doctorId}/${patientDbId}/${sessionId}/${item.artifactType}.png`;
        const { error: uploadErr } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
          contentType: "image/png",
          upsert: true
        });
        if (uploadErr) {
          console.warn(`[Screening Service] Warning uploading DR artifact ${item.artifactType}:`, uploadErr.message);
        }
        await supabaseAdmin.from("screening_artifacts").insert({
          screening_session_id: sessionId,
          doctor_id: doctorId,
          patient_id: patientDbId,
          artifact_type: item.artifactType,
          bucket_id: STORAGE_BUCKET,
          storage_path: storagePath,
          mime_type: "image/png",
          file_size_bytes: buffer.length,
          eye_side: eyeSide || "Right Eye"
        });
        const { data: signedData } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 86400);
        if (signedData?.signedUrl) {
          signedArtifacts[item.keyName] = signedData.signedUrl;
          signedArtifacts[item.artifactType] = signedData.signedUrl;
        }
      } catch (e) {
        console.error(`[Screening Service] Error processing DR artifact ${item.artifactType}:`, e);
      }
    })
  );
  const drSeverity = mlResult.severity?.drSeverity || "No DR";
  const confidence = (mlResult.severity?.confidence || 0) / 100;
  const imageQuality = mlResult.quality?.quality || "Good";
  const findings = mlResult.trinay?.findings || [];
  const recommendation = mlResult.severity?.recommendation || "Routine follow-up";
  const measurements = {
    anatomy: mlResult.trinay?.anatomy || {},
    lesions: mlResult.trinay?.lesions || {},
    findings,
    probabilities: mlResult.severity?.probabilities || {},
    quality_features: mlResult.quality?.features || {}
  };
  const modelOutput = {
    imageInfo: mlResult.imageInfo || {},
    quality: mlResult.quality || {},
    severity: mlResult.severity || {},
    trinay: {
      anatomy: mlResult.trinay?.anatomy || {},
      lesions: mlResult.trinay?.lesions || {},
      findings: mlResult.trinay?.findings || []
    },
    xai: mlResult.xai ? { has_xai: true } : null
  };
  const clinicalSummary = recommendation || (findings.length > 0 ? findings.join(". ") : "Screening complete.");
  const recommendations = {
    triage: drSeverity !== "No DR" ? "Referral for dilated ophthalmological examination" : "Annual routine screening",
    follow_up_period: drSeverity === "No DR" ? "12 months" : "2-4 weeks",
    referral_required: drSeverity !== "No DR"
  };
  const { data: resultRow, error: resultErr } = await supabaseAdmin.from("screening_results").insert({
    screening_session_id: sessionId,
    doctor_id: doctorId,
    patient_id: patientDbId,
    screening_type: "dr",
    verdict: drSeverity,
    probability: confidence,
    severity: drSeverity,
    image_quality: imageQuality,
    measurements,
    model_output: modelOutput,
    model_name: "EfficientNet-B0 + TRINAY Multi-Task Anatomy & Lesion Pipeline",
    model_version: "1.0.0",
    clinical_summary: clinicalSummary,
    recommendations,
    review_status: "pending_review"
  }).select("*").single();
  if (resultErr) {
    console.error("[Screening Service] Error inserting DR screening_results:", resultErr);
  }
  await supabaseAdmin.from("screening_sessions").update({
    status: "completed",
    completed_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", sessionId);
  return {
    sessionId,
    signedArtifacts,
    screeningRecord: {
      session: sessionRow,
      result: resultRow
    }
  };
}
async function uploadWithBoundedRetry(supabaseAdmin, bucket, storagePath, buffer, contentType = "image/png", retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
        contentType,
        upsert: true
      });
      if (!error) return true;
      console.warn(`[Supabase Upload Attempt ${attempt}/${retries} failed] ${storagePath}:`, error.message);
    } catch (e) {
      console.warn(`[Supabase Upload Attempt ${attempt}/${retries} error] ${storagePath}:`, e.message);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}
async function persistCataractScreening(supabaseAdmin, doctorId, patientDbId, eyeSide, mlResult) {
  const existingCandidateId = mlResult.session_id || mlResult.screening_id || mlResult.id;
  let sessionId = existingCandidateId;
  let sessionRow = null;
  if (sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    const { data: existingSess } = await supabaseAdmin.from("screening_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (existingSess) {
      sessionRow = existingSess;
      sessionId = existingSess.id;
    }
  }
  if (!sessionRow) {
    const { data: insertedRow, error: sessionErr } = await supabaseAdmin.from("screening_sessions").insert({
      ...sessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) ? { id: sessionId } : {},
      doctor_id: doctorId,
      patient_id: patientDbId,
      screening_type: "cataract",
      eye_side: eyeSide || "Right Eye",
      status: "completed",
      started_at: (/* @__PURE__ */ new Date()).toISOString(),
      completed_at: (/* @__PURE__ */ new Date()).toISOString()
    }).select("*").single();
    if (sessionErr || !insertedRow) {
      console.error("[Screening Service] Error inserting screening_sessions (Cataract):", sessionErr);
      throw new Error(`Database error creating cataract screening session: ${sessionErr?.message}`);
    }
    sessionRow = insertedRow;
    sessionId = sessionRow.id;
  }
  const signedArtifacts = {};
  const localTargetDir = import_path.default.join(process.cwd(), "uploads", "screening_results", sessionId);
  if (!import_fs.default.existsSync(localTargetDir)) {
    import_fs.default.mkdirSync(localTargetDir, { recursive: true });
  }
  const catVis = mlResult.visualizations || {};
  const artifactMapping = [
    {
      artifactType: "original_fundus",
      base64Data: catVis.original,
      keyName: "original"
    },
    {
      artifactType: "eye_box",
      base64Data: catVis.eyeDetection,
      keyName: "eye_box"
    },
    {
      artifactType: "iris",
      base64Data: catVis.iris,
      keyName: "iris"
    },
    {
      artifactType: "pupil",
      base64Data: catVis.pupil,
      keyName: "pupil"
    },
    {
      artifactType: "anatomy_map",
      base64Data: catVis.anatomy || catVis.anatomyCombined,
      keyName: "anatomy"
    },
    {
      artifactType: "gradcam",
      base64Data: catVis.gradcam,
      keyName: "gradcam"
    },
    {
      artifactType: "combined_xai",
      base64Data: catVis.workflow,
      keyName: "workflow"
    }
  ];
  if (catVis.analyzedRegion) {
    try {
      let raw = catVis.analyzedRegion;
      if (raw.includes(",")) raw = raw.split(",")[1];
      const buf = Buffer.from(raw, "base64");
      import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "analyzed_region.png"), buf);
      import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "analyzedRegion.png"), buf);
      signedArtifacts["analyzed_region"] = `/api/screenings/${sessionId}/artifacts/analyzed_region`;
    } catch {
    }
  }
  if (catVis.opacityEvidenceMap) {
    try {
      let raw = catVis.opacityEvidenceMap;
      if (raw.includes(",")) raw = raw.split(",")[1];
      const buf = Buffer.from(raw, "base64");
      import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "opacity_evidence.png"), buf);
      import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "opacityEvidenceMap.png"), buf);
      signedArtifacts["opacity_evidence"] = `/api/screenings/${sessionId}/artifacts/opacity_evidence`;
    } catch {
    }
  }
  await Promise.all(
    artifactMapping.map(async (item) => {
      if (!item.base64Data) return;
      try {
        let rawB64 = item.base64Data;
        if (rawB64.includes(",")) {
          rawB64 = rawB64.split(",")[1];
        }
        const buffer = Buffer.from(rawB64, "base64");
        try {
          import_fs.default.writeFileSync(import_path.default.join(localTargetDir, `${item.artifactType}.png`), buffer);
          if (item.keyName !== item.artifactType) {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, `${item.keyName}.png`), buffer);
          }
          if (item.artifactType === "original_fundus") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "original.png"), buffer);
          }
          if (item.artifactType === "eye_box") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "eyeDetection.png"), buffer);
          }
          if (item.artifactType === "gradcam") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "xai.png"), buffer);
          }
          if (item.artifactType === "combined_xai") {
            import_fs.default.writeFileSync(import_path.default.join(localTargetDir, "workflow.png"), buffer);
          }
        } catch (diskErr) {
          console.warn(`[Screening Service] Local disk write warning for ${item.artifactType}:`, diskErr);
        }
        signedArtifacts[item.keyName] = `/api/screenings/${sessionId}/artifacts/${item.keyName}`;
        signedArtifacts[item.artifactType] = `/api/screenings/${sessionId}/artifacts/${item.artifactType}`;
        const storagePath = `${doctorId}/${patientDbId}/${sessionId}/${item.artifactType}.png`;
        const uploadSuccess = await uploadWithBoundedRetry(
          supabaseAdmin,
          STORAGE_BUCKET,
          storagePath,
          buffer,
          "image/png",
          2
        );
        if (uploadSuccess) {
          await supabaseAdmin.from("screening_artifacts").upsert({
            screening_session_id: sessionId,
            doctor_id: doctorId,
            patient_id: patientDbId,
            artifact_type: item.artifactType,
            bucket_id: STORAGE_BUCKET,
            storage_path: storagePath,
            mime_type: "image/png",
            file_size_bytes: buffer.length,
            eye_side: eyeSide || "Right Eye"
          });
          const { data: signedData } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 86400);
          if (signedData?.signedUrl) {
            signedArtifacts[item.keyName] = signedData.signedUrl;
            signedArtifacts[item.artifactType] = signedData.signedUrl;
          }
        }
      } catch (e) {
        console.error(`[Screening Service] Error processing Cataract artifact ${item.artifactType}:`, e);
      }
    })
  );
  const isCataract = mlResult.cataract?.prediction === "CATARACT" || mlResult.prediction === "CATARACT";
  const cataractProbability = mlResult.cataract?.cataractProbability ?? mlResult.probability ?? 0;
  const imageQuality = mlResult.quality?.isGood ? "Good" : "Borderline";
  const measurements = {
    eyeDetection: mlResult.eyeDetection || {},
    irisLocalization: mlResult.irisLocalization || {},
    pupilLocalization: mlResult.pupilLocalization || {},
    quality: mlResult.quality || {},
    quantitativeAnalysis: mlResult.quantitativeAnalysis || {}
  };
  const modelOutput = {
    quality: mlResult.quality || {},
    eyeDetection: mlResult.eyeDetection || {},
    irisLocalization: mlResult.irisLocalization || {},
    pupilLocalization: mlResult.pupilLocalization || {},
    cataract: mlResult.cataract || {},
    quantitativeAnalysis: mlResult.quantitativeAnalysis || {}
  };
  const clinicalSummary = mlResult.cataract?.clinicalRecommendation || (isCataract ? "Anterior segment lens opacification detected. Clinical slit-lamp evaluation recommended." : "Clear anterior lens structure with normal pupillary reflex.");
  const recommendations = {
    triage: isCataract ? "Refer to Specialist / Cataract Clinic" : "Annual Routine Screening",
    follow_up_period: isCataract ? "2-4 weeks" : "12 months",
    referral_required: isCataract
  };
  const { data: resultRow, error: resultErr } = await supabaseAdmin.from("screening_results").upsert({
    screening_session_id: sessionId,
    doctor_id: doctorId,
    patient_id: patientDbId,
    screening_type: "cataract",
    verdict: isCataract ? "CATARACT" : "NORMAL",
    probability: cataractProbability,
    severity: mlResult.cataract?.severityGrade || (isCataract ? "Suspected Cataract" : "Normal"),
    image_quality: imageQuality,
    measurements,
    model_output: modelOutput,
    model_name: "TRINAY Cataract Pipeline (EfficientNet-V2-S)",
    model_version: "2.0.0",
    clinical_summary: clinicalSummary,
    recommendations,
    review_status: "pending_review"
  }).select("*").single();
  if (resultErr) {
    console.error("[Screening Service] Error inserting Cataract screening_results:", resultErr);
  }
  await supabaseAdmin.from("screening_sessions").update({
    status: "completed",
    completed_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", sessionId);
  return {
    sessionId,
    signedArtifacts,
    screeningRecord: {
      session: sessionRow,
      result: resultRow
    }
  };
}
screeningRouter.get("/", async (req, res) => {
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient3();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({ success: false, error: clientError || "Database configuration error." });
  }
  try {
    const typeFilter = req.query.type;
    let query = supabaseAdmin.from("screening_sessions").select(`
        id,
        doctor_id,
        patient_id,
        screening_type,
        eye_side,
        status,
        started_at,
        completed_at,
        created_at,
        patients (
          id,
          patient_id,
          name,
          age,
          gender,
          phone
        ),
        screening_results (
          id,
          verdict,
          probability,
          severity,
          image_quality,
          model_name,
          model_version,
          clinical_summary,
          recommendations,
          review_status,
          created_at
        ),
        screening_artifacts (
          id,
          artifact_type,
          bucket_id,
          storage_path,
          mime_type,
          file_size_bytes,
          created_at
        )
      `).order("created_at", { ascending: false });
    if (typeFilter) {
      query = query.eq("screening_type", typeFilter);
    }
    query = query.limit(100);
    const { data: sessions, error: fetchErr } = await query;
    if (fetchErr) {
      return res.status(500).json({ success: false, error: fetchErr.message });
    }
    const enrichedSessions = await Promise.all(
      (sessions || []).map(async (sess) => {
        const artifactsList = sess.screening_artifacts || [];
        const signedUrls = {};
        for (const art of artifactsList) {
          if (art.storage_path) {
            const { data: signed } = await supabaseAdmin.storage.from(art.bucket_id || STORAGE_BUCKET).createSignedUrl(art.storage_path, 86400);
            if (signed?.signedUrl) {
              signedUrls[art.artifact_type] = signed.signedUrl;
            }
          }
        }
        const patientObj = Array.isArray(sess.patients) ? sess.patients[0] : sess.patients;
        const resultObj = Array.isArray(sess.screening_results) ? sess.screening_results[0] : sess.screening_results;
        return {
          id: sess.id,
          doctorId: sess.doctor_id,
          patientId: patientObj?.patient_id || sess.patient_id,
          patientDbId: sess.patient_id,
          patientName: patientObj?.name || "Patient information unavailable",
          patientAge: patientObj?.age || 55,
          patientGender: patientObj?.gender || "Other",
          patientPhone: patientObj?.phone || "",
          screeningType: sess.screening_type,
          eye: sess.eye_side || "Right Eye",
          status: sess.status,
          date: sess.completed_at ? new Date(sess.completed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : new Date(sess.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          createdAt: sess.created_at,
          completedAt: sess.completed_at,
          result: resultObj,
          artifacts: signedUrls,
          // Mapped fields for direct compatibility with GlaucomaScreeningRecord / ScreeningRecord / CataractScreeningRecord
          drSeverity: resultObj?.severity || resultObj?.verdict || "No DR",
          confidence: Math.round((resultObj?.probability || 0) * 100),
          cataractPrediction: resultObj?.verdict || "NORMAL",
          cataractProbability: resultObj?.probability || 0,
          glaucomaPrediction: resultObj?.verdict || "NORMAL",
          glaucomaProbability: resultObj?.probability || 0,
          glaucomaFlag: resultObj?.verdict === "GLAUCOMA_SUSPECT",
          verticalCDR: resultObj?.measurements?.vertical_cdr || 0,
          horizontalCDR: resultObj?.measurements?.horizontal_cdr || 0,
          areaCDR: resultObj?.measurements?.area_cdr || 0,
          cdrFeatures: resultObj?.measurements?.cdr_features || {},
          imageQuality: resultObj?.image_quality || "Good",
          clinicalRecommendation: resultObj?.clinical_summary || "",
          shapImportance: resultObj?.model_output?.glaucoma?.shapImportance || {},
          overallStatus: resultObj?.verdict === "GLAUCOMA_SUSPECT" || resultObj?.verdict === "CATARACT" || sess.status === "Referred" ? "Referred" : "Completed",
          imageOriginal: signedUrls["original_fundus"] || signedUrls["original"],
          imageOpticNerve: signedUrls["optic_disc_cup"],
          imageRetinalAnatomy: signedUrls["vessel_segmentation"] || signedUrls["anatomy_map"] || signedUrls["anatomy"],
          imageGradCam: signedUrls["gradcam"] || signedUrls["xai"],
          imageWorkflow: signedUrls["combined_xai"] || signedUrls["workflow"] || signedUrls["combined"],
          imageEyeDetection: signedUrls["eye_box"],
          imageIris: signedUrls["iris"],
          imagePupil: signedUrls["pupil"],
          imageAnatomyCombined: signedUrls["anatomy"] || signedUrls["anatomy_map"],
          imageLesions: signedUrls["lesions"] || signedUrls["lesion_overlay"] || signedUrls["lesion"],
          imageAnatomy: signedUrls["anatomy"] || signedUrls["anatomy_map"] || signedUrls["anatomyCombined"],
          imageCombined: signedUrls["combined"] || signedUrls["combined_xai"] || signedUrls["workflow"],
          reportPdfUrl: signedUrls["report_pdf"]
        };
      })
    );
    return res.json({
      success: true,
      screenings: enrichedSessions
    });
  } catch (err) {
    console.error("[Screening Service] Exception in GET /api/screenings:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});
var ARTIFACT_ALIASES = {
  original: ["original", "original_fundus", "canonical"],
  original_fundus: ["original_fundus", "original", "canonical"],
  eye_box: ["eye_box", "eyeDetection", "eye_detection"],
  eyeDetection: ["eyeDetection", "eye_box", "eye_detection"],
  gradcam: ["gradcam", "xai", "gradcamOverlay", "gradcamRoi"],
  xai: ["xai", "gradcam"],
  workflow: ["workflow", "combined_xai", "combined"],
  combined_xai: ["combined_xai", "combined", "workflow"],
  combined: ["combined", "combined_xai", "workflow"],
  analyzed_region: ["analyzed_region", "analyzedRegion"],
  analyzedRegion: ["analyzedRegion", "analyzed_region"],
  opacity_evidence: ["opacity_evidence", "opacityEvidenceMap"],
  opacityEvidenceMap: ["opacityEvidenceMap", "opacity_evidence"],
  anatomy: ["anatomy", "anatomy_map", "anatomyCombined"],
  anatomy_map: ["anatomy_map", "anatomy", "anatomyCombined"],
  lesions: ["lesions", "lesion", "lesion_overlay"],
  lesion: ["lesion", "lesions", "lesion_overlay"],
  lesion_overlay: ["lesion_overlay", "lesions", "lesion"],
  iris: ["iris"],
  pupil: ["pupil"],
  optic_nerve: ["optic_nerve", "opticNerve", "optic_disc_cup"],
  opticNerve: ["opticNerve", "optic_nerve", "optic_disc_cup"],
  optic_disc_cup: ["optic_disc_cup", "optic_nerve", "opticNerve"],
  vessels: ["vessels", "retinalAnatomy", "vessel_segmentation"],
  retinalAnatomy: ["retinalAnatomy", "vessels", "vessel_segmentation"],
  vessel_segmentation: ["vessel_segmentation", "vessels", "retinalAnatomy"],
  report_pdf: ["report.pdf", "report_pdf.pdf", "report"],
  "report.pdf": ["report.pdf", "report_pdf.pdf", "report"]
};
screeningRouter.get("/:id/artifacts/:name", async (req, res) => {
  const { id, name } = req.params;
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanName = name.replace(/[^a-zA-Z0-9_.-]/g, "");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  const candidateNames = ARTIFACT_ALIASES[cleanName] || [cleanName];
  const extensions = [".png", ".jpg", ".jpeg", ".pdf", ""];
  const targetDir = import_path.default.join(process.cwd(), "uploads", "screening_results", cleanId);
  if (import_fs.default.existsSync(targetDir)) {
    for (const cName of candidateNames) {
      for (const ext of extensions) {
        const candidate = import_path.default.join(targetDir, cName + ext);
        if (import_fs.default.existsSync(candidate) && import_fs.default.statSync(candidate).isFile()) {
          const isPdf = candidate.endsWith(".pdf");
          const isJpg = candidate.endsWith(".jpg") || candidate.endsWith(".jpeg");
          const mime = isPdf ? "application/pdf" : isJpg ? "image/jpeg" : "image/png";
          res.setHeader("Content-Type", mime);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.sendFile(candidate);
        }
      }
    }
  }
  const resultsRoot = import_path.default.join(process.cwd(), "uploads", "screening_results");
  if (import_fs.default.existsSync(resultsRoot)) {
    const allDirs = import_fs.default.readdirSync(resultsRoot);
    for (const d of allDirs) {
      if (d === cleanId || d.includes(cleanId) || cleanId.includes(d)) {
        const candidateDir = import_path.default.join(resultsRoot, d);
        if (import_fs.default.statSync(candidateDir).isDirectory()) {
          for (const cName of candidateNames) {
            for (const ext of extensions) {
              const candidate = import_path.default.join(candidateDir, cName + ext);
              if (import_fs.default.existsSync(candidate) && import_fs.default.statSync(candidate).isFile()) {
                const isPdf = candidate.endsWith(".pdf");
                const isJpg = candidate.endsWith(".jpg") || candidate.endsWith(".jpeg");
                const mime = isPdf ? "application/pdf" : isJpg ? "image/jpeg" : "image/png";
                res.setHeader("Content-Type", mime);
                res.setHeader("Cache-Control", "public, max-age=86400");
                return res.sendFile(candidate);
              }
            }
          }
        }
      }
    }
  }
  try {
    const { client: supabaseAdmin } = getSupabaseAdminClient3();
    if (supabaseAdmin) {
      const { data: artRows } = await supabaseAdmin.from("screening_artifacts").select("*").eq("screening_session_id", cleanId);
      const matched = (artRows || []).find(
        (a) => candidateNames.includes(a.artifact_type)
      );
      if (matched && matched.storage_path) {
        const { data: fileBlob, error: dlErr } = await supabaseAdmin.storage.from(matched.bucket_id || STORAGE_BUCKET).download(matched.storage_path);
        if (!dlErr && fileBlob) {
          const buffer = Buffer.from(await fileBlob.arrayBuffer());
          try {
            if (!import_fs.default.existsSync(targetDir)) {
              import_fs.default.mkdirSync(targetDir, { recursive: true });
            }
            const ext = matched.mime_type === "application/pdf" ? ".pdf" : ".png";
            import_fs.default.writeFileSync(import_path.default.join(targetDir, `${cleanName}${ext}`), buffer);
          } catch {
          }
          res.setHeader("Content-Type", matched.mime_type || "image/png");
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.send(buffer);
        }
      }
    }
  } catch (err) {
    console.warn(`[Artifact Proxy Warning] ${cleanId}/${cleanName}:`, err.message);
  }
  return res.status(404).json({ error: `Artifact ${cleanName} not found for screening ${cleanId}` });
});
screeningRouter.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient3();
  if (clientError || !supabaseAdmin) {
    return res.status(500).json({ success: false, error: clientError || "Database configuration error." });
  }
  try {
    const { data: sess, error: fetchErr } = await supabaseAdmin.from("screening_sessions").select(`
        id,
        doctor_id,
        patient_id,
        screening_type,
        eye_side,
        status,
        started_at,
        completed_at,
        created_at,
        patients (
          id,
          patient_id,
          name,
          age,
          gender,
          phone
        ),
        screening_results (
          id,
          verdict,
          probability,
          severity,
          image_quality,
          measurements,
          model_output,
          model_name,
          model_version,
          clinical_summary,
          recommendations,
          review_status,
          created_at
        ),
        screening_artifacts (
          id,
          artifact_type,
          bucket_id,
          storage_path,
          mime_type,
          file_size_bytes,
          created_at
        )
      `).eq("id", id).maybeSingle();
    if (fetchErr || !sess) {
      return res.status(404).json({ success: false, error: fetchErr?.message || "Screening not found." });
    }
    const artifactsList = sess.screening_artifacts || [];
    const signedUrls = {};
    for (const art of artifactsList) {
      if (art.storage_path) {
        const { data: signed } = await supabaseAdmin.storage.from(art.bucket_id || STORAGE_BUCKET).createSignedUrl(art.storage_path, 86400);
        if (signed?.signedUrl) {
          signedUrls[art.artifact_type] = signed.signedUrl;
        }
      }
    }
    const reliableArtifacts = {
      original: signedUrls["original"] || signedUrls["original_fundus"] || `/api/screenings/${sess.id}/artifacts/original`,
      original_fundus: signedUrls["original_fundus"] || signedUrls["original"] || `/api/screenings/${sess.id}/artifacts/original_fundus`,
      eye_box: signedUrls["eye_box"] || `/api/screenings/${sess.id}/artifacts/eye_box`,
      analyzed_region: signedUrls["analyzed_region"] || `/api/screenings/${sess.id}/artifacts/analyzed_region`,
      opacity_evidence: signedUrls["opacity_evidence"] || `/api/screenings/${sess.id}/artifacts/opacity_evidence`,
      gradcam: signedUrls["gradcam"] || `/api/screenings/${sess.id}/artifacts/gradcam`,
      workflow: signedUrls["workflow"] || signedUrls["combined_xai"] || `/api/screenings/${sess.id}/artifacts/workflow`,
      combined_xai: signedUrls["combined_xai"] || signedUrls["combined"] || `/api/screenings/${sess.id}/artifacts/combined`,
      combined: signedUrls["combined"] || signedUrls["combined_xai"] || `/api/screenings/${sess.id}/artifacts/combined`,
      xai: signedUrls["xai"] || signedUrls["gradcam"] || `/api/screenings/${sess.id}/artifacts/xai`,
      anatomy: signedUrls["anatomy"] || signedUrls["anatomy_map"] || `/api/screenings/${sess.id}/artifacts/anatomy`,
      anatomy_map: signedUrls["anatomy_map"] || signedUrls["anatomy"] || `/api/screenings/${sess.id}/artifacts/anatomy`,
      optic_disc_cup: signedUrls["optic_disc_cup"] || `/api/screenings/${sess.id}/artifacts/optic_disc_cup`,
      vessel_segmentation: signedUrls["vessel_segmentation"] || `/api/screenings/${sess.id}/artifacts/vessel_segmentation`,
      lesions: signedUrls["lesions"] || signedUrls["lesion_overlay"] || `/api/screenings/${sess.id}/artifacts/lesions`,
      lesion_overlay: signedUrls["lesion_overlay"] || signedUrls["lesions"] || `/api/screenings/${sess.id}/artifacts/lesions`,
      report_pdf: signedUrls["report_pdf"] || `/api/screenings/${sess.id}/artifacts/report.pdf`,
      ...signedUrls
    };
    const patientObj = Array.isArray(sess.patients) ? sess.patients[0] : sess.patients;
    const resultObj = Array.isArray(sess.screening_results) ? sess.screening_results[0] : sess.screening_results;
    const quant = resultObj?.measurements?.quantitativeAnalysis || resultObj?.model_output?.quantitativeAnalysis || {};
    const screeningData = {
      id: sess.id,
      doctorId: sess.doctor_id,
      patientId: patientObj?.patient_id || sess.patient_id,
      patientDbId: sess.patient_id,
      patientName: patientObj?.name || "Patient information unavailable",
      patientAge: patientObj?.age || 55,
      patientGender: patientObj?.gender || "Other",
      patientPhone: patientObj?.phone || "",
      screeningType: sess.screening_type,
      eye: sess.eye_side || "Right Eye",
      status: sess.status,
      date: sess.completed_at ? new Date(sess.completed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : new Date(sess.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      createdAt: sess.created_at,
      completedAt: sess.completed_at,
      result: resultObj,
      artifacts: reliableArtifacts,
      // DR Mappings
      drSeverity: resultObj?.severity || resultObj?.verdict || "No DR",
      confidence: Math.round((resultObj?.probability || 0) * 100),
      findings: resultObj?.measurements?.findings || [],
      recommendation: resultObj?.clinical_summary || "",
      // Cataract Mappings
      cataractPrediction: resultObj?.verdict || "NORMAL",
      cataractProbability: resultObj?.probability || 0,
      normalProbability: typeof quant.normalProbability === "number" ? quant.normalProbability : 1 - (resultObj?.probability || 0),
      eyeDetected: Boolean(resultObj?.measurements?.eyeDetection?.detected),
      eyeConfidence: resultObj?.measurements?.eyeDetection?.confidence || 0,
      irisDetected: Boolean(resultObj?.measurements?.irisLocalization?.detected),
      pupilDetected: Boolean(resultObj?.measurements?.pupilLocalization?.detected),
      quantitativeAnalysis: quant,
      // Glaucoma Mappings
      glaucomaPrediction: resultObj?.verdict || "NORMAL",
      glaucomaProbability: resultObj?.probability || 0,
      glaucomaFlag: resultObj?.verdict === "GLAUCOMA_SUSPECT",
      verticalCDR: resultObj?.measurements?.vertical_cdr || 0,
      horizontalCDR: resultObj?.measurements?.horizontal_cdr || 0,
      areaCDR: resultObj?.measurements?.area_cdr || 0,
      cdrFeatures: resultObj?.measurements?.cdr_features || {},
      imageQuality: resultObj?.image_quality || "Good",
      clinicalRecommendation: resultObj?.clinical_summary || "",
      shapImportance: resultObj?.model_output?.glaucoma?.shapImportance || {},
      overallStatus: resultObj?.verdict === "GLAUCOMA_SUSPECT" || resultObj?.verdict === "CATARACT" || sess.status === "Referred" ? "Referred" : "Completed",
      // Artifact URLs guaranteed to be non-empty and non-giant
      imageOriginal: reliableArtifacts.original,
      imageOpticNerve: reliableArtifacts.optic_disc_cup,
      imageRetinalAnatomy: reliableArtifacts.vessel_segmentation,
      imageGradCam: reliableArtifacts.gradcam,
      imageWorkflow: reliableArtifacts.workflow,
      imageEyeDetection: reliableArtifacts.eye_box,
      imageIris: reliableArtifacts.iris || `/api/screenings/${sess.id}/artifacts/iris`,
      imagePupil: reliableArtifacts.pupil || `/api/screenings/${sess.id}/artifacts/pupil`,
      imageAnatomyCombined: reliableArtifacts.anatomy,
      imageAnalyzedRegion: reliableArtifacts.analyzed_region,
      imageOpacityEvidence: reliableArtifacts.opacity_evidence,
      imageLesions: reliableArtifacts.lesions,
      imageAnatomy: reliableArtifacts.anatomy,
      imageCombined: reliableArtifacts.combined_xai,
      reportPdfUrl: reliableArtifacts.report_pdf
    };
    return res.json({
      success: true,
      screening: screeningData
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
screeningRouter.post("/:id/report-pdf", async (req, res) => {
  const { id } = req.params;
  const cleanId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const { client: supabaseAdmin, error: clientError } = getSupabaseAdminClient3();
  try {
    const { pdfBase64, doctorId, patientId } = req.body || {};
    const localDir = import_path.default.join(process.cwd(), "uploads", "screening_results", cleanId);
    const localPdfPath = import_path.default.join(localDir, "report.pdf");
    if (pdfBase64) {
      let rawB64 = pdfBase64;
      if (rawB64.includes(",")) {
        rawB64 = rawB64.split(",")[1];
      }
      const pdfBuffer = Buffer.from(rawB64, "base64");
      if (!import_fs.default.existsSync(localDir)) {
        import_fs.default.mkdirSync(localDir, { recursive: true });
      }
      import_fs.default.writeFileSync(localPdfPath, pdfBuffer);
      if (supabaseAdmin) {
        const { data: sess } = await supabaseAdmin.from("screening_sessions").select("id, doctor_id, patient_id").eq("id", cleanId).maybeSingle();
        const targetDoctorId = sess?.doctor_id || doctorId || "unknown-doctor";
        const targetPatientId = sess?.patient_id || patientId || "unknown-patient";
        const storagePath = `${targetDoctorId}/${targetPatientId}/${cleanId}/report_pdf.pdf`;
        await uploadWithBoundedRetry(supabaseAdmin, STORAGE_BUCKET, storagePath, pdfBuffer, "application/pdf", 2);
        await supabaseAdmin.from("screening_artifacts").upsert({
          screening_session_id: cleanId,
          doctor_id: targetDoctorId,
          patient_id: targetPatientId,
          artifact_type: "report_pdf",
          bucket_id: STORAGE_BUCKET,
          storage_path: storagePath,
          mime_type: "application/pdf",
          file_size_bytes: pdfBuffer.length
        });
        const { data: signed } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 86400);
        return res.json({
          success: true,
          pdfUrl: signed?.signedUrl || `/api/screenings/${cleanId}/artifacts/report.pdf`,
          storagePath
        });
      }
      return res.json({
        success: true,
        pdfUrl: `/api/screenings/${cleanId}/artifacts/report.pdf`
      });
    }
    if (import_fs.default.existsSync(localPdfPath)) {
      return res.json({
        success: true,
        pdfUrl: `/api/screenings/${cleanId}/artifacts/report.pdf`
      });
    }
    return res.json({
      success: true,
      pdfUrl: `/api/screenings/${cleanId}/artifacts/report.pdf`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// server/api/mlService.ts
var import_genai = require("@google/genai");
var mlRouter = (0, import_express5.Router)();
var ML_SERVER_URL = (process.env.ML_SERVER_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
function proxyRaw(pythonPath, body, contentType, callback, timeoutMs = 18e4) {
  const urlObj = new URL(ML_SERVER_URL + pythonPath);
  const isHttps = urlObj.protocol === "https:";
  const lib = isHttps ? https : http;
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname,
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Content-Length": body.length
    }
  };
  const req = lib.request(options, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => callback(null, res.statusCode || 500, Buffer.concat(chunks)));
  });
  req.setTimeout(timeoutMs, () => {
    req.destroy(new Error("ML server connection timed out"));
  });
  req.on("error", (e) => callback(e, 500, Buffer.from("{}")));
  req.write(body);
  req.end();
}
function proxyGet(pythonPath, callback) {
  const urlObj = new URL(ML_SERVER_URL + pythonPath);
  const isHttps = urlObj.protocol === "https:";
  const lib = isHttps ? https : http;
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname,
    method: "GET"
  };
  const req = lib.request(options, (res) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => callback(null, res.statusCode || 500, Buffer.concat(chunks)));
  });
  req.setTimeout(6e4, () => {
    req.destroy(new Error("ML server connection timed out"));
  });
  req.on("error", (e) => callback(e, 500, Buffer.from("{}")));
  req.end();
}
function bufferBody(req) {
  if (req.body && Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
    return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  }
  if (req.readableEnded) {
    return Promise.resolve(Buffer.from([]));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
mlRouter.get("/health", (req, res) => {
  proxyGet("/ml/health", (err, status, data) => {
    if (err) {
      res.status(503).json({ error: "ML server unreachable", detail: err.message });
      return;
    }
    try {
      res.status(status).json(JSON.parse(data.toString()));
    } catch {
      res.status(status).send(data);
    }
  });
});
mlRouter.post("/analyze", async (req, res) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const patientIdentifier = req.headers["x-patient-id"] || req.query.patient_id;
    const patientName = req.headers["x-patient-name"] || req.query.patient_name;
    const patientAge = Number(req.headers["x-patient-age"] || req.query.patient_age) || 55;
    const patientGender = req.headers["x-patient-gender"] || req.query.patient_gender || "Other";
    const patientPhone = req.headers["x-patient-phone"] || req.query.patient_phone || "";
    const eyeSide = req.headers["x-eye-side"] || req.query.eye_side || "Right Eye";
    proxyRaw("/ml/analyze", body, contentType, async (err, status, data) => {
      if (err) {
        res.status(500).json({ error: "ML server error", detail: err.message });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        res.status(status).send(data);
        return;
      }
      if (status === 200 && parsed && parsed.severity) {
        const { client: supabaseAdmin } = getSupabaseAdminClient3();
        if (supabaseAdmin) {
          try {
            let doctorId = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
              const token = authHeader.replace(/^Bearer\s+/i, "").trim();
              const { data: userData } = await supabaseAdmin.auth.getUser(token);
              if (userData?.user?.id) {
                doctorId = userData.user.id;
              }
            }
            if (!doctorId) {
              const { data: firstProfile } = await supabaseAdmin.from("profiles").select("id").limit(1).maybeSingle();
              doctorId = firstProfile?.id || "00000000-0000-0000-0000-000000000000";
            }
            const patientDbId = await resolvePatientDbId(
              supabaseAdmin,
              patientIdentifier,
              doctorId,
              { name: patientName, age: patientAge, gender: patientGender, phone: patientPhone }
            );
            const persisted = await persistDRScreening(
              supabaseAdmin,
              doctorId,
              patientDbId,
              eyeSide,
              parsed
            );
            parsed.screening_id = persisted.sessionId;
            parsed.screening_session_id = persisted.sessionId;
            parsed.patient_db_id = patientDbId;
            parsed.artifacts = persisted.signedArtifacts;
            parsed.persisted = true;
            if (persisted.signedArtifacts) {
              parsed.signedVisualizations = {
                original: persisted.signedArtifacts.original,
                combined: persisted.signedArtifacts.combined,
                anatomy: persisted.signedArtifacts.anatomy,
                lesions: persisted.signedArtifacts.lesions,
                optic_disc: persisted.signedArtifacts.optic_disc,
                vessel: persisted.signedArtifacts.vessel
              };
            }
          } catch (persistErr) {
            console.error("[ML Proxy] Error persisting DR screening to Supabase:", persistErr);
            parsed.persistence_error = persistErr.message;
          }
        }
      }
      res.status(status).json(parsed);
    }, 18e4);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
mlRouter.post("/quality", async (req, res) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    proxyRaw("/ml/quality", body, contentType, (err, status, data) => {
      if (err) {
        res.status(500).json({ error: "ML server error", detail: err.message });
        return;
      }
      try {
        res.status(status).json(JSON.parse(data.toString()));
      } catch {
        res.status(status).send(data);
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
mlRouter.post("/cataract/analyze", async (req, res) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const patientIdentifier = req.headers["x-patient-id"] || req.query.patient_id;
    const patientName = req.headers["x-patient-name"] || req.query.patient_name;
    const patientAge = Number(req.headers["x-patient-age"] || req.query.patient_age) || 55;
    const patientGender = req.headers["x-patient-gender"] || req.query.patient_gender || "Other";
    const patientPhone = req.headers["x-patient-phone"] || req.query.patient_phone || "";
    const eyeSide = req.headers["x-eye-side"] || req.query.eye_side || "Right Eye";
    proxyRaw("/ml/cataract/analyze", body, contentType, async (err, status, data) => {
      if (err) {
        res.status(500).json({ error: "ML server error", detail: err.message });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        res.status(status).send(data);
        return;
      }
      if (status === 200 && parsed && (parsed.status === "COMPLETE" || parsed.cataract)) {
        const { client: supabaseAdmin } = getSupabaseAdminClient3();
        if (supabaseAdmin) {
          try {
            let doctorId = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
              const token = authHeader.replace(/^Bearer\s+/i, "").trim();
              const { data: userData } = await supabaseAdmin.auth.getUser(token);
              if (userData?.user?.id) {
                doctorId = userData.user.id;
              }
            }
            if (!doctorId) {
              const { data: firstProfile } = await supabaseAdmin.from("profiles").select("id").limit(1).maybeSingle();
              doctorId = firstProfile?.id || "00000000-0000-0000-0000-000000000000";
            }
            const patientDbId = await resolvePatientDbId(
              supabaseAdmin,
              patientIdentifier,
              doctorId,
              { name: patientName, age: patientAge, gender: patientGender, phone: patientPhone }
            );
            const persisted = await persistCataractScreening(
              supabaseAdmin,
              doctorId,
              patientDbId,
              eyeSide,
              parsed
            );
            parsed.screening_id = persisted.sessionId;
            parsed.screening_session_id = persisted.sessionId;
            parsed.patient_db_id = patientDbId;
            parsed.artifacts = persisted.signedArtifacts;
            parsed.persisted = true;
            if (persisted.signedArtifacts) {
              parsed.signedVisualizations = {
                original: persisted.signedArtifacts.original,
                eyeDetection: persisted.signedArtifacts.eye_box,
                iris: persisted.signedArtifacts.iris,
                pupil: persisted.signedArtifacts.pupil,
                anatomy: persisted.signedArtifacts.anatomy,
                gradcam: persisted.signedArtifacts.gradcam,
                workflow: persisted.signedArtifacts.workflow
              };
            }
          } catch (persistErr) {
            console.error("[ML Proxy] Error persisting cataract screening to Supabase:", persistErr);
            parsed.persistence_error = persistErr.message;
          }
        }
      }
      res.status(status).json(parsed);
    }, 18e4);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
mlRouter.post("/cataract/quality", async (req, res) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    proxyRaw("/ml/cataract/quality", body, contentType, (err, status, data) => {
      if (err) {
        res.status(500).json({ error: "ML server error", detail: err.message });
        return;
      }
      try {
        res.status(status).json(JSON.parse(data.toString()));
      } catch {
        res.status(status).send(data);
      }
    }, 2e4);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
mlRouter.post("/glaucoma/analyze", async (req, res) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const patientIdentifier = req.headers["x-patient-id"] || req.query.patient_id;
    const patientName = req.headers["x-patient-name"] || req.query.patient_name;
    const patientAge = Number(req.headers["x-patient-age"] || req.query.patient_age) || 55;
    const patientGender = req.headers["x-patient-gender"] || req.query.patient_gender || "Other";
    const patientPhone = req.headers["x-patient-phone"] || req.query.patient_phone || "";
    const eyeSide = req.headers["x-eye-side"] || req.query.eye_side || "Right Eye";
    proxyRaw("/ml/glaucoma/analyze", body, contentType, async (err, status, data) => {
      if (err) {
        res.status(500).json({ error: "ML server error", detail: err.message });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        res.status(status).send(data);
        return;
      }
      if (status === 200 && parsed && parsed.status === "COMPLETE") {
        const { client: supabaseAdmin } = getSupabaseAdminClient3();
        if (supabaseAdmin) {
          try {
            let doctorId = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
              const token = authHeader.replace(/^Bearer\s+/i, "").trim();
              const { data: userData } = await supabaseAdmin.auth.getUser(token);
              if (userData?.user?.id) {
                doctorId = userData.user.id;
              }
            }
            if (!doctorId) {
              const { data: firstProfile } = await supabaseAdmin.from("profiles").select("id").limit(1).maybeSingle();
              doctorId = firstProfile?.id || "00000000-0000-0000-0000-000000000000";
            }
            const patientDbId = await resolvePatientDbId(
              supabaseAdmin,
              patientIdentifier,
              doctorId,
              { name: patientName, age: patientAge, gender: patientGender, phone: patientPhone }
            );
            const persisted = await persistGlaucomaScreening(
              supabaseAdmin,
              doctorId,
              patientDbId,
              eyeSide,
              parsed
            );
            parsed.screening_id = persisted.sessionId;
            parsed.screening_session_id = persisted.sessionId;
            parsed.patient_db_id = patientDbId;
            parsed.artifacts = persisted.signedArtifacts;
            parsed.persisted = true;
            if (persisted.signedArtifacts) {
              parsed.signedVisualizations = {
                original: persisted.signedArtifacts.original,
                opticNerve: persisted.signedArtifacts.opticNerve,
                retinalAnatomy: persisted.signedArtifacts.retinalAnatomy,
                gradcam: persisted.signedArtifacts.gradcam,
                workflow: persisted.signedArtifacts.workflow
              };
            }
          } catch (persistErr) {
            console.error("[ML Proxy] Error persisting glaucoma screening to Supabase:", persistErr);
            parsed.persistence_error = persistErr.message;
          }
        }
      }
      res.status(status).json(parsed);
    }, 18e4);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
mlRouter.post("/glaucoma/quality", async (req, res) => {
  try {
    const body = await bufferBody(req);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    proxyRaw("/ml/glaucoma/quality", body, contentType, (err, status, data) => {
      if (err) {
        res.status(500).json({ error: "ML server error", detail: err.message });
        return;
      }
      try {
        res.status(status).json(JSON.parse(data.toString()));
      } catch {
        res.status(status).send(data);
      }
    }, 2e4);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
mlRouter.post("/trinay/ask", async (req, res) => {
  try {
    const body = await bufferBody(req);
    let parsedBody;
    try {
      parsedBody = JSON.parse(body.toString());
    } catch (e) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    const { question, current_case, language, speak } = parsedBody;
    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({ error: "GEMINI_API_KEY is missing in environment variables" });
      return;
    }
    const ai = new import_genai.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `You are TRINAY, an advanced AI ophthalmology assistant. 
    A user is asking a question: "${question}"
    The language you must reply in is: ${language || "English"}
    
    Here is the context of their current medical case (if any):
    ${current_case ? JSON.stringify(current_case, null, 2) : "No specific case context provided."}
    
    Please provide a helpful, medically sound (but clear for patients if applicable), and accurate response. 
    Always reply in the requested language. Do NOT use markdown code blocks for the final response if possible, just natural text with formatting.`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    res.json({
      answer: response.text,
      sources: ["TRINAY Native AI Agent"],
      modelUsed: "gemini-2.5-flash",
      audio_b64: null,
      audio_format: null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// server.ts
import_dotenv.default.config();
var mlProcess = null;
function checkMLServerHealth() {
  return new Promise((resolve) => {
    const req = import_http.default.get("http://127.0.0.1:5001/ml/health", (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1e3, () => {
      req.destroy();
      resolve(false);
    });
  });
}
async function ensureMLServerRunning() {
  const isRunning = await checkMLServerHealth();
  if (isRunning) {
    console.log("[RETINA-X ML Server] Already running on http://127.0.0.1:5001");
    return;
  }
  const venvPython = import_path2.default.join(process.cwd(), ".venv", "bin", "python");
  const pythonCmd = import_fs2.default.existsSync(venvPython) ? venvPython : "python3";
  const scriptPath = import_fs2.default.existsSync(import_path2.default.join(process.cwd(), "app.py")) ? import_path2.default.join(process.cwd(), "app.py") : import_path2.default.join(process.cwd(), "ml_server.py");
  console.log(`[RETINA-X ML Server] Starting Python ML server (${pythonCmd} ${scriptPath})...`);
  mlProcess = (0, import_child_process.spawn)(pythonCmd, [scriptPath], {
    stdio: "inherit",
    cwd: process.cwd()
  });
  mlProcess.on("error", (err) => {
    console.error("[RETINA-X ML Server] Failed to start Python process:", err.message);
  });
  mlProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.log(`[RETINA-X ML Server] Python process exited with code ${code}`);
    }
    mlProcess = null;
  });
  const cleanup = () => {
    if (mlProcess) {
      try {
        mlProcess.kill("SIGTERM");
      } catch {
      }
      mlProcess = null;
    }
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit();
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit();
  });
  process.on("exit", cleanup);
}
async function startServer() {
  await ensureMLServerRunning();
  const app = (0, import_express6.default)();
  const PORT = 3e3;
  app.use(import_express6.default.json({ limit: "50mb" }));
  app.use(import_express6.default.urlencoded({ extended: true, limit: "50mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "RETINA-X Medical AI Platform" });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminUserRouter);
  app.use("/api/patients", patientRouter);
  app.use("/api/ml", mlRouter);
  app.use("/api/screenings", screeningRouter);
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express6.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[RETINA-X Server] Running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
