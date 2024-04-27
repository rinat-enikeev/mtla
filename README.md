# Montelibero Association Functions

Code for Montelibero Cloud Functions. 

## MTLA Payouts Telegram Bot 

The Bot is able to show the list of Stellar addresses of the MTLA Council and prepare transaction for distributing full `EURMTL` balance from the given Stellar address to the Council with respect to Council members voting power.  

### Deployment

The following steps will deploy the MTLA Payouts Telegram Bot on the Cloud Functions for Firebase. 

Create your [Firebase project](https://firebase.google.com) and set up billing. 

Install [Firebase tools](https://github.com/firebase/firebase-tools?tab=readme-ov-file#node-package) and [login](https://firebase.google.com/docs/cli). 

```bash
npm install -g firebase-tools
firebase login
```

Replace project identifier `montelibero` with your Firebase project identifier in [.firebaserc](./.firebaserc) file. 

```json
{
  "projects": {
    "default": "your-project-identifier"
  }
}
```

Create local `.env` file inside [functions](./functions/) folder with Telegram [Bot Token](https://core.telegram.org/bots/tutorial#obtain-your-bot-token) and your [Cloud Function URL](https://cloud.google.com/functions/docs/calling/http#url):
```
MTLA_PAYOUTS_BOT_TOKEN={your_telegram_bot_token}
CLOUD_FUNCTION_PUBLIC_URL={https://REGION-PROJECT_ID.cloudfunctions.net/FUNCTION_NAME}
```
Where `REGION` is `europe-central2` and `FUNCTION_NAME` is `echoBot`, `PROJECT_ID` is your Firebase project identifier.  

Deploy Cloud Functions. 

```bash
firebase deploy --only functions
```

Set Telegram Bot Webhook by making a Post request: 

```bash
curl --location --globoff --request POST 'https://api.telegram.org/{MTLA_PAYOUTS_BOT_TOKEN}/setWebhook?url={CLOUD_FUNCTION_PUBLIC_URL}%2F{FUNCTION_NAME}&allowed_updates=[%22message%22]'
```

Open your Telegram Bot and press `/start`. Now you should be able to interact with the bot. 
