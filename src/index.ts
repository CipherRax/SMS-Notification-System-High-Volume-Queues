import { smsQueue } from "./queue"

async function addTestJob() {
  await smsQueue.add("send-sms", {
    phone: "+25410000000",
    message: "Hello from BullMQ here 🚀",
  }, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    }
  })
  console.log("Test sms Job Added!")
}
//The test line here or what 

addTestJob()
