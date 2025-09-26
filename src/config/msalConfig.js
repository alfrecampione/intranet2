import { ConfidentialClientApplication } from "@azure/msal-node";

const config = {
    auth: {
        clientId: process.env.MS_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}`,
        clientSecret: process.env.MS_CLIENT_SECRET,
    },
};

const cca = new ConfidentialClientApplication(config);

const SCOPES = ["user.read", "email", "openid", "profile"];

export { cca, SCOPES };