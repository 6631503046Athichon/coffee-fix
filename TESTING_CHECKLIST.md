# Phase 1 Security Fixes - Testing Checklist

## Pre-Deployment Testing

### 1. Build & Compilation ✅
- [x] Backend builds successfully
- [x] No TypeScript errors
- [x] Prisma client generated
- [x] No build warnings

### 2. Environment Configuration
- [ ] JWT_SECRET is set and >= 32 characters
- [ ] JWT_SECRET has sufficient entropy (>= 16 unique chars)
- [ ] Database connection string is correct
- [ ] All required environment variables are present

### 3. Database Migration
- [ ] Backup created
- [ ] Migration file exists: `20260216000001_remove_temporary_password`
- [ ] Migration can be applied without errors
- [ ] temporaryPassword column removed from User table

---

## Functional Testing

### Authentication & Authorization

#### Test 1.1: JWT Secret Validation
```bash
# Test startup with invalid JWT_SECRET
# Expected: Application should fail to start with clear error message

# Set JWT_SECRET to short value
JWT_SECRET="short" npm run dev
# Expected: Error "JWT_SECRET must be at least 32 characters"

# Set JWT_SECRET to low entropy
JWT_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" npm run dev
# Expected: Error "JWT_SECRET has insufficient entropy"
```

#### Test 1.2: Registration Lockdown
```bash
# Test: Unauthenticated registration attempt
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123","name":"Test User"}'
# Expected: 401 Unauthorized

# Test: Non-admin authenticated registration attempt
# Login as non-admin user first, then:
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Cookie: auth-token=<non-admin-token>" \
  -d '{"email":"test@test.com","password":"password123","name":"Test User"}'
# Expected: 403 Forbidden

# Test: Admin registration
# Login as admin, then:
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Cookie: auth-token=<admin-token>" \
  -d '{"email":"test@test.com","password":"password123","name":"Test User","roles":["Farmer"]}'
# Expected: 201 Created, user created with mustChangePassword=true
```

#### Test 1.3: No Plaintext Passwords
```bash
# Test: Create new user via admin
# Expected: No temporaryPassword field in response

# Test: GET /api/users
# Expected: No temporaryPassword field in user objects

# Test: Database query
psql -d coffee-lab -c "SELECT column_name FROM information_schema.columns WHERE table_name='User' AND column_name='temporaryPassword';"
# Expected: 0 rows (column doesn't exist)
```

#### Test 1.4: BOLA Protection

**Green Bean Lots**
```bash
# Test: Non-processor tries to update green bean lot
# Login as Farmer, then:
curl -X PUT http://localhost:3001/api/green-bean-lots/<lot-id> \
  -H "Cookie: auth-token=<farmer-token>" \
  -H "Content-Type: application/json" \
  -d '{"grade":"A"}'
# Expected: 403 Forbidden

# Test: Processor can update
# Login as Processor, then:
curl -X PUT http://localhost:3001/api/green-bean-lots/<lot-id> \
  -H "Cookie: auth-token=<processor-token>" \
  -H "Content-Type: application/json" \
  -d '{"grade":"A"}'
# Expected: 200 OK, lot updated
```

**Harvest Lots (Ownership)**
```bash
# Test: User tries to update another user's harvest lot
# Login as Farmer A, then:
curl -X PUT http://localhost:3001/api/harvest-lots/<farmer-b-lot-id> \
  -H "Cookie: auth-token=<farmer-a-token>" \
  -H "Content-Type: application/json" \
  -d '{"weightKg":100}'
# Expected: 403 Forbidden

# Test: User can update own harvest lot
curl -X PUT http://localhost:3001/api/harvest-lots/<farmer-a-lot-id> \
  -H "Cookie: auth-token=<farmer-a-token>" \
  -H "Content-Type: application/json" \
  -d '{"weightKg":100}'
# Expected: 200 OK, lot updated

# Test: Admin can update any harvest lot
curl -X PUT http://localhost:3001/api/harvest-lots/<any-lot-id> \
  -H "Cookie: auth-token=<admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"weightKg":100}'
# Expected: 200 OK, lot updated
```

**Cupping Sessions**
```bash
# Test: Non-cupper tries to create session
# Login as Farmer, then:
curl -X POST http://localhost:3001/api/cupping-sessions \
  -H "Cookie: auth-token=<farmer-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Session","type":"QC"}'
# Expected: 403 Forbidden

# Test: Cupper can create session
curl -X POST http://localhost:3001/api/cupping-sessions \
  -H "Cookie: auth-token=<cupper-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Session","type":"QC"}'
# Expected: 201 Created
```

**Processing Batches**
```bash
# Test: Non-processor tries to delete
curl -X DELETE http://localhost:3001/api/processing-batches/<batch-id> \
  -H "Cookie: auth-token=<farmer-token>"
# Expected: 403 Forbidden

# Test: Processor can delete
curl -X DELETE http://localhost:3001/api/processing-batches/<batch-id> \
  -H "Cookie: auth-token=<processor-token>"
# Expected: 200 OK (if no linked parchment lots)
```

#### Test 1.5: JWT Configuration
```bash
# Test: Login and check token claims
# Login, then decode JWT:
# Expected claims:
# - exp: ~24 hours from now (not 7 days)
# - iss: "coffee-lab-api"
# - aud: "coffee-lab-app"
# - alg: "HS256"

# Test: Old tokens are rejected
# Use a token from before deployment
curl -X GET http://localhost:3001/api/auth/me \
  -H "Cookie: auth-token=<old-token>"
# Expected: 401 Unauthorized (Invalid token)
```

#### Test 1.6: Token Extraction
```bash
# Test: first-login-update endpoint
curl -X POST http://localhost:3001/api/auth/first-login-update \
  -H "Cookie: auth-token=<valid-token>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword":"old","newPassword":"new123456"}'
# Expected: Works correctly (uses requireAuth internally)

# Test: transfer-ownership endpoint
curl -X POST http://localhost:3001/api/users/transfer-ownership \
  -H "Cookie: auth-token=<super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"targetUserId":"<admin-user-id>"}'
# Expected: Works correctly (uses requireAuth internally)
```

---

## Input Validation Testing

### Safe Float Parsing
```bash
# Test: Invalid numeric input
curl -X PUT http://localhost:3001/api/green-bean-lots/<lot-id> \
  -H "Cookie: auth-token=<processor-token>" \
  -H "Content-Type: application/json" \
  -d '{"currentWeightKg":"abc"}'
# Expected: 400 Bad Request OR value ignored (depends on implementation)

# Test: Null/undefined numeric values
curl -X PUT http://localhost:3001/api/processing-batches/<batch-id> \
  -H "Cookie: auth-token=<processor-token>" \
  -H "Content-Type: application/json" \
  -d '{"parchmentWeightKg":null}'
# Expected: 200 OK, value set to null

# Test: Negative withdrawal amount
curl -X POST http://localhost:3001/api/green-bean-lots/<lot-id>/withdrawals \
  -H "Cookie: auth-token=<processor-token>" \
  -H "Content-Type: application/json" \
  -d '{"amountKg":-10,"withdrawalType":"Sale","purpose":"Test"}'
# Expected: 400 Bad Request
```

---

## Integration Testing

### User Workflow Tests

#### Test: Complete User Registration & First Login Flow
1. Admin creates user
   - Check: No temporaryPassword in response
   - Check: User has mustChangePassword=true
2. Admin shares credentials securely (out of band)
3. User logs in with temporary credentials
4. User forced to change password
   - Check: mustChangePassword becomes false
5. User can now access system normally

#### Test: Authorization Hierarchy
1. Create test users with different roles:
   - Farmer
   - Processor
   - Roaster
   - Cupper
   - HeadJudge
   - Admin
2. Test each role's access to protected endpoints
3. Verify proper 403 responses for unauthorized actions
4. Verify proper 200/201 responses for authorized actions

#### Test: Resource Ownership
1. Farmer A creates harvest lot
2. Farmer B tries to edit/delete Farmer A's lot
   - Expected: 403 Forbidden
3. Farmer A can edit/delete own lot
   - Expected: 200 OK
4. Admin can edit/delete any lot
   - Expected: 200 OK

---

## Error Handling Testing

### Test Error Responses
```bash
# Test: 401 Unauthorized
curl -X GET http://localhost:3001/api/auth/me
# Expected: {"error":"Unauthorized"}, status 401

# Test: 403 Forbidden
curl -X POST http://localhost:3001/api/auth/register \
  -H "Cookie: auth-token=<farmer-token>"
# Expected: {"error":"Forbidden"}, status 403

# Test: 404 Not Found
curl -X GET http://localhost:3001/api/green-bean-lots/invalid-id \
  -H "Cookie: auth-token=<admin-token>"
# Expected: {"error":"Green bean lot not found"}, status 404
```

---

## Performance Testing

### Token Validation Cache
```bash
# Test: Multiple requests with same token
# Should use cached user data (check logs for database queries)
for i in {1..10}; do
  curl -X GET http://localhost:3001/api/auth/me \
    -H "Cookie: auth-token=<valid-token>"
done
# Expected: Only 1 database query (rest from cache)
```

---

## Security Testing

### JWT Security
- [ ] JWT secret is not exposed in error messages
- [ ] JWT secret is not in version control
- [ ] Tokens expire after 24 hours
- [ ] Algorithm is locked to HS256
- [ ] Issuer and audience are validated

### Authorization
- [ ] All sensitive endpoints require authentication
- [ ] Role checks are enforced
- [ ] Ownership checks work correctly
- [ ] No privilege escalation possible
- [ ] Proper error codes (403 vs 401)

### Data Protection
- [ ] No passwords in API responses
- [ ] No passwords in database (temporaryPassword removed)
- [ ] No passwords in logs
- [ ] No passwords in email

---

## Regression Testing

### Existing Functionality
- [ ] User login still works
- [ ] User logout still works
- [ ] Password reset still works
- [ ] All CRUD operations work for authorized users
- [ ] Search and filtering work
- [ ] Pagination works
- [ ] File uploads work (if applicable)

---

## Browser Testing

### Session Management
- [ ] Login creates cookie
- [ ] Logout removes cookie
- [ ] Token expiry triggers re-login
- [ ] Multiple tabs share session
- [ ] Session persists across page refresh

---

## Load Testing (Optional)

```bash
# Use Apache Bench or similar tool
ab -n 1000 -c 10 \
  -H "Cookie: auth-token=<valid-token>" \
  http://localhost:3001/api/auth/me

# Expected: No errors, consistent response times
```

---

## Post-Deployment Verification

### Production Checks
- [ ] Application starts successfully
- [ ] No startup errors in logs
- [ ] Database connection successful
- [ ] JWT secret validation passes
- [ ] Migration applied successfully
- [ ] All API endpoints respond correctly
- [ ] No 500 errors in production logs
- [ ] Users can login
- [ ] Authorization works as expected

### Monitoring
- [ ] Set up alerts for 401/403 errors
- [ ] Monitor failed login attempts
- [ ] Track token expiry rates
- [ ] Monitor database query performance

---

## Rollback Criteria

Trigger rollback if:
- [ ] Critical functionality broken
- [ ] Database migration fails
- [ ] More than 10% of users cannot login
- [ ] Production errors exceed threshold
- [ ] Performance degradation > 50%

---

## Sign-Off

- [ ] All functional tests passed
- [ ] All security tests passed
- [ ] No critical bugs found
- [ ] Documentation updated
- [ ] Team notified of changes
- [ ] Rollback plan prepared
- [ ] Monitoring configured

**Tested by:** _________________
**Date:** _________________
**Approved by:** _________________
**Date:** _________________
