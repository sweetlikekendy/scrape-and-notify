import axios from "axios"
import cheerio from "cheerio"
import nodemailer from "nodemailer"
import { google } from "googleapis"
require("dotenv").config()

const fetchUrl = async (url) => {
  try {
    const response = await axios.get(url)
    const { status } = response
    let item = {}
    if (status === 200) {
      const { data } = response
      const $ = cheerio.load(data)

      const title = $(`div.sku-title>h1`).get(0).children[0].data

      const itemPrice = $(`div.priceView-customer-price>span:first-child`).get(
        0
      ).children[0].data
      // remove dollar sign from price
      const noDollarSignPrice = itemPrice.replace(`$`, ``)
      // convert price from string to number
      const toNumberPrice = noDollarSignPrice * 1

      const sku = $(`div.sku>span.product-data-value`).get(0).children[0].data
      // SKU without whitespace
      const skuTrimmed = sku.trim()
      const apiAddToCartUrl = `https://api.bestbuy.com/click/-/${skuTrimmed}/cart/`

      const itemAvailability =
        $(`button.add-to-cart-button`).get(0).children[0].data === undefined
          ? $(`button.add-to-cart-button`).get(0).children[1].data
          : $(`button.add-to-cart-button`).get(0).children[0].data
      const lowercaseItemAvailability = itemAvailability.toLowerCase()
      const isInStock =
        lowercaseItemAvailability === (`sold out` || `unavailable nearby`)
          ? false
          : true

      item = {
        title,
        price: toNumberPrice,
        sku: skuTrimmed,
        addToCartUrl: apiAddToCartUrl,
        itemAvailability: lowercaseItemAvailability,
        isInStock,
        url,
      }

      return item
    }
    console.log(`no response while getting ${url}`)
    return item
  } catch (error) {
    console.log(`error getting html response`)
    console.error(error)
  }
}

const sendEmail = async (
  isInStock,
  transporter,
  title,
  textToSend,
  html,
  accessToken
) => {
  let isEmailSent = false

  if (isInStock) {
    try {
      const date = new Date()
      let info = await transporter.sendMail({
        from: `"instocknotificationbot" <${process.env.GMAIL_SEND_FROM_USERNAME}>`,
        to: process.env.GMAIL_SEND_TO_USERNAME,
        subject: `IN STOCK NOTIFICATION ${title}`,
        text: textToSend,
        html,
        auth: {
          user: process.env.GMAIL_SEND_FROM_USERNAME,
          refreshToken: process.env.OAUTH_REFRESH_TOKEN,
          accessToken,
        },
      })

      if (info.rejected.length > 0) {
        return {
          isEmailSent,
          message: `something went wrong with sending the email`,
        }
      }

      isEmailSent = true
      return {
        isEmailSent,
        message: `"${title}" IS IN STOCK - ${date}`,
      }
    } catch (error) {
      console.log(
        `there was an error sending an email. check the emails (receiving and sending accounts) and refresh token`
      )
      console.error(error)
      return {
        isEmailSent,
        message: `${error.message}`,
      }
    }
  }
}

const sendNotification = async (item) => {
  const { addToCartUrl, title, url, isInStock } = item

  const oauth2Client = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.OAUTH_REFRESH_TOKEN,
  })

  try {
    const accessToken = await oauth2Client.getAccessToken()
    const mailOptions = {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAUTH2",
        //set these in your .env file
        clientId: process.env.OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
      },
    }

    let transporter = nodemailer.createTransport(mailOptions)
    let textToSend = `In stock notification for ${title} at Best Buy`
    let htmlText = `<tr>
    <td width="33%" align="left" bgcolor="#EEEEEE" style="font-family: Verdana, Geneva, Helvetica, Arial, sans-serif; font-size: 12px; color: #252525; padding:10px; padding-right:0;">${addToCartUrl}</a></td>
    <td width="33%" align="left" bgcolor="#EEEEEE" style="font-family: Verdana, Geneva, Helvetica, Arial, sans-serif; font-size: 12px; color: #252525; padding:10px; padding-right:0;">${url}</td>
    <td width="33%" align="left" bgcolor="#EEEEEE" style="font-family: Verdana, Geneva, Helvetica, Arial, sans-serif; font-size: 12px; color: #252525; padding:10px; padding-right:0;"><p>${title}</p></td>
    </tr>`

    const html = ` 
    <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF">
    <colgroup span="3">
  <tr width="94%" border="0" cellpadding="0" cellspacing="0">
  <th width="33%" align="left" bgcolor="#252525" style="font-family: Verdana, Geneva, Helvetica, Arial, sans-serif; font-size: 12px; color: #EEEEEE; padding:10px; padding-right:0;">Add To Cart Link</th>
  <th width="33%" align="left" bgcolor="#252525" style="font-family: Verdana, Geneva, Helvetica, Arial, sans-serif; font-size: 12px; color: #EEEEEE; padding:10px; padding-right:0;">Link</th>
  <th width="33%" align="left" bgcolor="#252525" style="font-family: Verdana, Geneva, Helvetica, Arial, sans-serif; font-size: 12px; color: #EEEEEE; padding:10px; padding-right:0;">Title</th>
  </tr>
  </colgroup>
  ${htmlText}
  </table>
  `

    const mailMessage = await sendEmail(
      isInStock,
      transporter,
      title,
      textToSend,
      html,
      accessToken.token
    )
    return mailMessage
  } catch (error) {
    console.log(`error connecting to oAuth2Client`)
    console.error(error)
    return error
  }
}

const getInStockMessage = async (itemToCheck) => {
  if (itemToCheck.isInStock) {
    try {
      const isInStockMessage = await sendNotification(itemToCheck)
      if (isInStockMessage.isEmailSent) {
        console.log(isInStockMessage.message)
      } else {
        console.log(`something went wrong while sending the email`)
      }
    } catch (error) {
      console.error(error)
    }
  } else {
    const date = new Date()
    console.log(`${itemToCheck.title} is not in stock - ${date}`)
  }
}

const startTracking = async () => {
  const bestBuyProductUrl = `https://www.bestbuy.com/site/nvidia-geforce-rtx-3080-10gb-gddr6x-pci-express-4-0-graphics-card-titanium-and-black/6429440.p?skuId=6429440`

  try {
    const itemToCheck = await fetchUrl(bestBuyProductUrl)
    await getInStockMessage(itemToCheck)
  } catch (error) {
    console.log(`error trying to tracking`)
    console.error(error)
  }
}

setInterval(() => startTracking(), 5000)
