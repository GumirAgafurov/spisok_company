import axios from 'axios';
import fs from 'fs';
import process from 'process';

class WebhookClient {
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl;
        this.requestCount = 0;
    }

    async sendMessage(message) {
        this.requestCount++;
        try {
            const response = await axios.post(this.webhookUrl, message);
            return response.data;
        } catch (error) {
            throw new Error(`Webhook error: ${error.message}`);
        }
    }

    async getCompanies() {
        let start = 0;
        const limit = 50;
        const MAX_COMPANIES = 10000;
        const allCompanies = [];

        console.log('📥 Начало загрузки компаний...');

        while (true) {
            try {
                this.requestCount++;
                
                const response = await axios.get(`${this.webhookUrl}crm.company.list`, {
                    params: { start, order: 'ID' },
                    timeout: 30000
                });

                if (!response.data) {
                    throw new Error('Пустой ответ от сервера');
                }

                if (response.data.error) {
                    throw new Error(`API Error: ${response.data.error} - ${response.data.error_description}`);
                }

                if (!response.data.result || !Array.isArray(response.data.result)) {
                    console.log('Некорректный формат ответа от API');
                    break;
                }

                const companies = response.data.result;

                if (companies.length === 0) {
                    console.log('Получен пустой массив компаний - завершение');
                    break;
                }

                allCompanies.push(...companies);
                console.log(`Добавлено ${companies.length} компаний. Всего: ${allCompanies.length}`);

                if (allCompanies.length >= MAX_COMPANIES) {
                    console.log(`Достигнут лимит в ${MAX_COMPANIES} компаний`);
                    break;
                }

                if (companies.length < limit) {
                    console.log(`Получено ${companies.length} компаний (меньше ${limit}) - это последняя страница`);
                    break;
                }

                start += companies.length;

            } catch (error) {
                throw error;
            }
        }

        console.log(`Загрузка завершена. Всего компаний: ${allCompanies.length}`);
        return allCompanies;
    }

    getRequestCount() {
        return this.requestCount;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveToFileAsync(companies, filename = 'companies.json') {
    try {
        const dataToSave = {
            meta: {
                generatedAt: new Date().toISOString(),
                totalCompanies: companies.length,
                version: '1.0'
            },
            data: companies
        };

        await fs.promises.writeFile(filename, JSON.stringify(dataToSave, null, 2));
        console.log(`✅ Данные сохранены в файл: ${filename}`);
        console.log(`📊 Компаний сохранено: ${companies.length}`);
        
    } catch (error) {
        console.error('❌ Ошибка при сохранении файла:', error.message);
    }
}

function displayResults(companies) {
    console.log('\n📊 === РЕЗУЛЬТАТЫ ЗАГРУЗКИ ===');
    console.log(`Общее количество компаний: ${companies.length}`);
    
    console.log('\n👀 Первые 5 компаний (пример):');
    console.log('─'.repeat(50));
    
    if (companies.length > 0) {
        companies.slice(0, 5).forEach((company, index) => {
            console.log(`${index + 1}. ${company.NAME || 'Без названия'} (ID: ${company.ID})`);
            if (company.EMAIL) console.log(`   📧 Email: ${company.EMAIL}`);
            if (company.PHONE) console.log(`   📞 Телефон: ${company.PHONE}`);
            console.log('');
        });
    } else {
        console.log('Нет компаний для отображения');
    }
    
    console.log('─'.repeat(50));
}

function validateWebhookUrl(webhookUrl) {
    if (!webhookUrl) {
        console.error('❌ Ошибка: Укажите webhook URL');
        console.log('Пример: node script.js https://your-domain.bitrix24.ru/rest/1/your-webhook/');
        process.exit(1);
    }
    
    if (!webhookUrl.startsWith('http')) {
        console.error('❌ Ошибка: Webhook URL должен начинаться с http:// или https://');
        process.exit(1);
    }
}

function handleError(error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.error('❌ Сетевая ошибка: Не удалось подключиться к серверу');
        console.error('   Проверьте интернет-соединение и правильность URL');
    }
    else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error('❌ Сетевая ошибка: Превышено время ожидания');
        console.error('   Попробуйте увеличить timeout или проверить скорость соединения');
    }
    else if (error.response && error.response.data) {
        const bitrixError = error.response.data;
        console.error('❌ Ошибка API Битрикс24:');
        console.error(`   Код: ${bitrixError.error}`);
        console.error(`   Сообщение: ${bitrixError.error_description}`);
        
        if (bitrixError.error === 'ERROR_ACCESS_DENIED') {
            console.error('   🔐 Доступ запрещен. Проверьте webhook URL и права доступа');
        } else if (bitrixError.error === 'INVALID_TOKEN') {
            console.error('   🔑 Неверный webhook токен');
        } else if (bitrixError.error === 'METHOD_NOT_FOUND') {
            console.error('   📡 Метод crm.company.list не найден');
        }
    }
    else if (error.message.includes('Webhook error')) {
        console.error(`❌ Ошибка webhook: ${error.message}`);
    }
    else {
        console.error('❌ Неизвестная ошибка:', error.message);
    }
    
    process.exit(1);
}

async function main() {
    try {
        const webhookUrl = process.argv[2];
        
        validateWebhookUrl(webhookUrl);
        
        console.log(`🔗 Webhook URL: ${webhookUrl}`);
        console.log('🔄 Запуск процесса загрузки компаний...\n');
        
        const webhookClient = new WebhookClient(webhookUrl);
        const companies = await webhookClient.getCompanies();
        
        if (companies.length > 0) {
            await saveToFileAsync(companies, 'bitrix_companies.json');
            displayResults(companies);
        } else {
            console.log('ℹ️  Компании не найдены');
        }
        
    } catch (error) {
        handleError(error);
    }
}

function runTests() {
    console.log('🔬 Режим тестирования с мок-данными');
    
    const testCompanies = [
        { ID: "1", NAME: "Тест 1", EMAIL: "test1@test.com" },
        { ID: "2", NAME: "Тест 2", PHONE: "+79990001122" }
    ];
    
    displayResults(testCompanies);
    saveToFileAsync(testCompanies, 'test_output.json');
}

function showUsage() {
    console.log('❌ Укажите webhook URL или --test для тестирования');
    console.log('Пример: node script.js https://your-domain.bitrix24.ru/rest/1/xxx/');
    console.log('Или:    node script.js --test');
}

// Запуск приложения
if (process.argv[2] === '--test') {
    runTests();
} else if (process.argv[2]) {
    main();
} else {
    showUsage();
}

export { WebhookClient, saveToFileAsync, displayResults };