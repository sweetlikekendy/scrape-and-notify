import axios from "axios"
import cheerio from "cheerio"

const fetchUrl = async (url) => {
  try {
    const response = await axios.get(url)
    // console.log(response)
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

      const itemAvailability = $(`button.add-to-cart-button`).get(0).children[0]
        .data
      const lowercaseItemAvailability = itemAvailability.toLowerCase()
      const isInStock = lowercaseItemAvailability === `sold out` ? false : true

      item = {
        title,
        price: toNumberPrice,
        sku: skuTrimmed,
        addToCartUrl: apiAddToCartUrl,
        itemAvailability: lowercaseItemAvailability,
        isInStock,
      }

      console.log(item)
      return item
    }
    console.log(`no response while getting ${url}`)
    return item
  } catch (error) {
    console.error(error)
  }
}

const startTracking = () => {
  const bestBuyProductUrl = `https://www.bestbuy.com/site/nvidia-geforce-rtx-3080-10gb-gddr6x-pci-express-4-0-graphics-card-titanium-and-black/6429440.p?skuId=6429440`

  fetchUrl(bestBuyProductUrl)
}

startTracking()
