import { ConfidentialClientApplication } from "@azure/msal-node";

const config = {
    auth: {
        clientId: process.env.MS_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/v2.0`,
        clientSecret: process.env.MS_CLIENT_SECRET,
    },
};

const cca = new ConfidentialClientApplication(config);

const APP_SCOPES = ["https://graph.microsoft.com/.default"];

const LOGIN_SCOPES = ["user.read", "email", "openid", "profile"];

export { cca, APP_SCOPES, LOGIN_SCOPES };