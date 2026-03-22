# Azure AD SSO Setup Guide

This guide walks through configuring Microsoft Entra ID (Azure AD) single sign-on for the News Budget app.

## Prerequisites

- Access to the [Azure Portal](https://portal.azure.com) with permission to register applications
- Admin consent privileges (or access to someone who has them)

## 1. Register the Application

1. Go to **Azure Portal** → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Fill in:
   - **Name**: `News Budget App`
   - **Supported account types**: *Accounts in this organizational directory only* (single tenant)
   - **Redirect URI**: Select **Web** and enter:
     - Production: `https://your-domain.com/api/auth/callback/azure-ad`
     - Local dev: `http://localhost:3000/api/auth/callback/azure-ad`
3. Click **Register**

## 2. Collect Credentials

From the app registration **Overview** page, copy:

| Azure Portal field | Environment variable |
|---|---|
| Application (client) ID | `AZURE_AD_CLIENT_ID` |
| Directory (tenant) ID | `AZURE_AD_TENANT_ID` |

Then create a client secret:

1. Go to **Certificates & secrets** → **Client secrets** → **New client secret**
2. Set a description (e.g., `News Budget`) and expiration (recommended: 24 months)
3. Copy the secret **Value** immediately (it won't be shown again)

| Azure Portal field | Environment variable |
|---|---|
| Client secret Value | `AZURE_AD_CLIENT_SECRET` |

## 3. Configure Group-Based Access

Only members of a specific security group will be able to sign in via SSO.

### Create or identify the security group

1. Go to **Microsoft Entra ID** → **Groups**
2. Find an existing group or create a new one:
   - **Group type**: Security
   - **Group name**: e.g., `News Budget Users`
   - **Membership type**: Assigned
3. Add the users who should have access
4. Copy the group's **Object ID**

| Azure Portal field | Environment variable |
|---|---|
| Group Object ID | `AZURE_AD_ALLOWED_GROUP_ID` |

> If `AZURE_AD_ALLOWED_GROUP_ID` is left empty, any user in the tenant can sign in via SSO.

### Enable group claims in the ID token

1. Go to your **App registration** → **Token configuration**
2. Click **Add groups claim**
3. Select **Security groups**
4. Under the **ID** token section, select **Group ID**
5. Click **Add**

### Grant group read permission (recommended)

If users may belong to more than 200 groups, Azure returns an "overage" indicator instead of inline group claims. To handle this gracefully:

1. Go to **API permissions** → **Add a permission**
2. Select **Microsoft Graph** → **Delegated permissions**
3. Search for and add `GroupMember.Read.All`
4. Click **Grant admin consent for [your org]**

> For most organizations with fewer than 200 groups per user, the token claim alone is sufficient.

## 4. Set Environment Variables

### Local development

Add to your `.env` file:

```env
AZURE_AD_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_CLIENT_SECRET=your-client-secret-value
AZURE_AD_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_ALLOWED_GROUP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Vercel deployment

```bash
vercel env add AZURE_AD_CLIENT_ID
vercel env add AZURE_AD_CLIENT_SECRET
vercel env add AZURE_AD_TENANT_ID
vercel env add AZURE_AD_ALLOWED_GROUP_ID
```

## 5. Apply Database Migration

The `passwordHash` field is now optional (SSO-only users don't have passwords):

```bash
npx prisma db push
```

## 6. Verify

1. Start the dev server: `npm run dev`
2. Navigate to `/login` — you should see a "Sign in with Microsoft" button above the email/password form
3. Click it — you should be redirected to Microsoft's login page
4. After authenticating, you should be redirected back to the app
5. If you're in the allowed group and no `User` record exists, one is auto-created with the `VIEWER` role

## How It Works

### Sign-in flow

1. User clicks "Sign in with Microsoft" on the login page
2. NextAuth redirects to Microsoft's OAuth login
3. Microsoft authenticates the user and returns an ID token with group claims
4. The `signIn` callback checks if the user's groups include `AZURE_AD_ALLOWED_GROUP_ID`
5. If the user passes the group check, their email is matched to a `User` record in the database
6. If no record exists, one is auto-created with `appRole: "VIEWER"`
7. The `jwt` callback populates `appRole` and `personId` from the database record

### User provisioning

| Method | How it works |
|---|---|
| **Auto-provision via SSO** | User is in the Azure AD group → signs in → gets created as `VIEWER`. Admin promotes via `/admin/users`. |
| **Pre-provision by admin** | Admin creates user at `/admin/users` with matching email (password optional). SSO sign-in matches by email. |
| **Hybrid** | Admin creates user with a password. User can sign in via either method. |

### Disabling SSO

Remove or unset `AZURE_AD_CLIENT_ID`. The app reverts to credentials-only login with no SSO button shown.

## Troubleshooting

| Problem | Solution |
|---|---|
| "Sign in with Microsoft" button not visible | Verify `AZURE_AD_CLIENT_ID` is set in your environment and restart the dev server |
| Redirect error after Microsoft login | Check the redirect URI in Azure matches exactly: `{BASE_URL}/api/auth/callback/azure-ad` |
| User rejected after Microsoft login | Verify the user is a member of the security group specified by `AZURE_AD_ALLOWED_GROUP_ID` |
| User signs in but has wrong role | Admin can update the role at `/admin/users`. Roles refresh from the DB every ~5 minutes. |
| `AADSTS700016` error | Client ID is wrong or the app registration was deleted |
| `AADSTS7000215` error | Client secret is wrong or expired — generate a new one in Azure Portal |
| Groups claim missing from token | Verify Token configuration has the groups claim added (step 3 above) |

## Client Secret Rotation

Azure AD client secrets expire. To rotate:

1. Go to **App registration** → **Certificates & secrets**
2. Create a new client secret
3. Update `AZURE_AD_CLIENT_SECRET` in your environment (local `.env` and Vercel)
4. Delete the old secret after confirming the new one works

Set a calendar reminder for 1–2 weeks before expiration.
