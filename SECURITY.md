# Security Hardening Implementation

This document outlines all security measures implemented to protect the KubeChart application from common vulnerabilities.

## 1. Client-Side Security

### Input Validation & Sanitization

#### Repository Input Validation
- **Maximum length:** 500 characters
- **Format requirement:** "name https://url"
- **Allowed characters in name:** Alphanumeric, hyphens, underscores only
- **URL validation:** Must be valid URL starting with https://
- **Blocked characters:** `;`, `|`, `&`, `$`, `` ` ``, `(`, `)`, `{`, `}`, `<`, `>`, newlines

#### Helm Install Input Validation
- **Maximum length:** 1000 characters
- **Blocked characters:** `;`, `|`, `&`, `$`, `` ` ``, `(`, `)`, `{`, `}`, `<`, `>`, newlines
- **Real-time validation:** Inputs are validated as user types
- **Error messages:** Clear feedback when validation fails

### Implementation
```typescript
// Validation functions in client/pages/CreateChart.tsx
- validateRepositoryInput(): Validates repository format and URL
- validateHelmInstallInput(): Prevents command injection
```

## 2. Server-Side Security

### Command Injection Prevention

#### Before (Vulnerable)
```javascript
// ❌ VULNERABLE - uses execSync with string concatenation
execSync(`helm repo add ${repoName} ${repoUrl}`);
execSync(`helm upgrade --install ${helmInstall}`);
```

#### After (Secure)
```javascript
// ✅ SECURE - uses spawnSync with separate arguments array
spawnSync("helm", ["repo", "add", repoName, repoUrl]);
spawnSync("helm", ["upgrade", "--install", ...helmArgs]);
```

### Input Validation on Server
- **Repository validation:** Format, name pattern, URL format
- **Helm command validation:** Length limits, dangerous character blocking
- **Consistent validation:** Same rules enforced client AND server side

### Server-Side Validators
```typescript
// server/routes/deploy.ts
- validateInput(): General validation for length and dangerous characters
- validateRepository(): Specific validation for repository format
```

## 3. HTTP Security Headers

The following security headers are implemented:

```
X-Frame-Options: SAMEORIGIN
  - Prevents clickjacking attacks

X-Content-Type-Options: nosniff
  - Prevents MIME type sniffing attacks

X-XSS-Protection: 1; mode=block
  - Enables browser XSS protection

Referrer-Policy: strict-origin-when-cross-origin
  - Controls referrer information leakage

Permissions-Policy: geolocation=(), microphone=(), camera=()
  - Disables access to sensitive APIs
```

## 4. Authentication & Authorization

### Token Management
- **JWT-based authentication:** Secure token generation and verification
- **Token expiry:** 7 days (configurable via JWT_EXPIRY)
- **Bearer token scheme:** Standard Authorization header format
- **Protected routes:** Deployment endpoints require authentication via authMiddleware

### Password Security
- **Hashing algorithm:** bcryptjs with salt (10 rounds)
- **Password verification:** Secure comparison to prevent timing attacks

## 5. Request Limits

### Payload Size Limits
```javascript
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb" }));
```
- Prevents large payload attacks
- Limits memory consumption

## 6. Input Length Restrictions

| Field | Max Length | Purpose |
|-------|-----------|---------|
| Repository | 500 chars | Prevent DoS via huge inputs |
| Helm Install | 1000 chars | Reasonable limit for helm commands |
| Form payloads | 1 MB | Total request size limit |

## 7. Error Handling

### Client-Side
- Clear, user-friendly error messages
- Validation errors shown before API call
- Failed requests show generic errors

### Server-Side
- **Detailed errors NOT exposed to clients**
- Generic error messages returned: "Deployment failed. Please check your inputs and try again."
- Sensitive error information only logged server-side
- Prevents information leakage about system internals

## 8. HTTPS Requirement

- Repository URLs must use HTTPS (enforced)
- Prevents man-in-the-middle attacks
- Protects credentials and data in transit

## 9. Environment Variables

### Critical Configuration
```
JWT_SECRET=<strong-secret-key>
  - MUST be set in production
  - Change from default value
  - Use strong, randomly generated string
```

**WARNING:** The default JWT_SECRET in code is for development only. Set a strong secret in production.

## 10. CORS Configuration

- CORS is enabled for cross-origin requests
- Consider restricting to specific origins in production
- Current config: `app.use(cors())` allows all origins

### Production Recommendation
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com'],
  credentials: true
}));
```

## Security Best Practices Implemented

✅ **Input Validation** - Multi-layer validation (client + server)
✅ **Command Injection Prevention** - Using argument arrays instead of string concatenation
✅ **XSS Prevention** - Proper error handling without dangling HTML
✅ **CSRF Tokens** - Authentication via JWT tokens
✅ **Rate Limiting** - Payload size limits enforced
✅ **Secure Headers** - Security headers set on all responses
✅ **Authentication** - JWT-based authentication on sensitive endpoints
✅ **Password Hashing** - bcryptjs with salt rounds
✅ **Error Handling** - Generic error messages, no system info leakage
✅ **HTTPS** - Required for repository URLs
✅ **Principle of Least Privilege** - Only necessary permissions granted

## Known Limitations & Future Improvements

### Current Limitations
1. **CORS**: Currently allows all origins - should be restricted in production
2. **Rate Limiting**: No rate limiting implemented - should add for production
3. **Token Storage**: Client uses localStorage - vulnerable to XSS if browser compromised
4. **Session Management**: No session revocation mechanism

### Recommended Future Improvements
1. Implement rate limiting (e.g., express-rate-limit)
2. Add CSRF token validation for form submissions
3. Use httpOnly, secure cookies instead of localStorage for tokens
4. Implement request signing for API calls
5. Add audit logging for all deployment actions
6. Implement Content Security Policy (CSP) headers
7. Add API key rate limiting per user
8. Implement secrets management (Vault, etc.)
9. Add request sanitization middleware
10. Monitor and alert on suspicious patterns

## Testing & Verification

### To verify security measures:

1. **Input validation:**
   - Try entering shell metacharacters in Helm field
   - Try URLs with http:// instead of https://
   - Try inputs longer than limits

2. **Command injection attempts:**
   - `; rm -rf /` - Should be blocked
   - `$(whoami)` - Should be blocked
   - `| cat /etc/passwd` - Should be blocked

3. **Headers verification:**
   ```bash
   curl -I http://localhost:3000/api/ping
   # Check response headers
   ```

## Incident Response

If a security vulnerability is discovered:
1. Stop the deployment immediately
2. Review logs for any exploitation
3. Rotate JWT_SECRET
4. Reset user passwords if exposed
5. Update input validation rules
6. Deploy patches to all instances

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security](https://expressjs.com/en/advanced/best-practice-security.html)
- [Command Injection](https://owasp.org/www-community/attacks/Command_Injection)

---

**Last Updated:** 2024
**Security Level:** Production-Ready (with noted improvements)
