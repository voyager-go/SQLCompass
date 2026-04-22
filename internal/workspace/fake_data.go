package workspace

import (
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

/* ── 预设字典 ── */

var (
	chineseSurnames = []string{"张", "王", "李", "刘", "陈", "杨", "黄", "赵", "吴", "周", "徐", "孙", "马", "朱", "胡", "郭", "何", "高", "林", "罗", "郑", "梁", "谢", "宋", "唐", "许", "韩", "冯", "邓", "曹", "彭", "曾", "肖", "田", "董", "袁", "潘", "于", "蒋", "蔡", "余", "杜", "叶", "程", "苏", "魏", "吕", "丁", "任", "沈"}
	chineseNames   = []string{"伟", "芳", "娜", "秀英", "敏", "静", "丽", "强", "磊", "军", "洋", "勇", "艳", "杰", "娟", "涛", "明", "超", "秀兰", "霞", "平", "刚", "桂英", "华", "建国", "建华", "国华", "和平", "明远", "志强", "志远", "文博", "文轩", "子涵", "子轩", "浩然", "皓轩", "梓涵", "梓轩", "宇航", "雨泽", "天佑", "睿渊", "立诚", "立轩", "博文", "博涛", "苑杰", "黎昕", "昊然"}

	englishFirstNames = []string{"James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra", "Donald", "Ashley", "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle", "Kenneth", "Dorothy", "Kevin", "Carol", "Brian", "Amanda", "George", "Melissa", "Edward", "Deborah"}
	englishLastNames  = []string{"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts"}

	emailDomains    = []string{"gmail.com", "qq.com", "163.com", "126.com", "outlook.com", "hotmail.com", "sina.com", "sohu.com", "foxmail.com", "aliyun.com", "icloud.com", "yahoo.com", "live.com", "protonmail.com"}
	companyPrefixes = []string{"阿里", "腾讯", "字节", "百度", "美团", "京东", "滴滴", "华为", "小米", "网易", "拼多多", "快手", "哔哩", "携程", "顺丰", "OPPO", "vivo", "联想", "中兴", "大疆"}
	companySuffixes = []string{"科技", "网络", "信息", "软件", "智能", "云计算", "电子商务", "传媒", "金融", "控股", "集团", "有限公司", "股份有限公司"}
	jobTitles       = []string{"软件工程师", "产品经理", "UI设计师", "测试工程师", "运维工程师", "数据分析师", "算法工程师", "前端工程师", "后端工程师", "全栈工程师", "技术总监", "项目经理", "运营专员", "市场经理", "销售代表", "人力资源专员", "财务主管", "行政助理", "客服专员", "内容编辑", "摄影师", "翻译", "律师", "医生", "教师", "建筑师", "咨询顾问", "采购专员", "物流专员", "质量工程师"}

	provinces      = []string{"北京市", "上海市", "广东省", "浙江省", "江苏省", "四川省", "山东省", "河南省", "湖北省", "湖南省", "福建省", "安徽省", "河北省", "陕西省", "辽宁省", "重庆市", "天津市", "江西省", "广西壮族自治区", "山西省", "云南省", "黑龙江省", "贵州省", "吉林省", "甘肃省", "海南省", "内蒙古自治区", "新疆维吾尔自治区", "宁夏回族自治区", "青海省", "西藏自治区"}
	cities         = []string{"北京", "上海", "广州", "深圳", "杭州", "南京", "成都", "武汉", "西安", "重庆", "天津", "苏州", "郑州", "长沙", "青岛", "大连", "宁波", "厦门", "济南", "哈尔滨", "长春", "沈阳", "福州", "合肥", "昆明", "石家庄", "太原", "南昌", "南宁", "贵阳", "兰州", "海口", "乌鲁木齐", "呼和浩特", "银川", "西宁", "拉萨", "珠海", "东莞", "佛山", "无锡", "常州", "烟台", "唐山", "徐州", "温州", "绍兴", "嘉兴", "金华", "台州"}
	streetNames    = []string{"中山路", "解放路", "人民路", "建设路", "文化路", "工业路", "友谊路", "和平路", "胜利路", "光明路", "东风路", "朝阳路", "新华路", "青年路", "红旗路", "迎春路", "幸福路", "安康路", "复兴路", "兴业路", "学府路", "科技路", "创新路", "创业路", "发展路", "富民路", "思源路", "宏图路", "锦绣路", "华兴路"}
	productNames   = []string{"智能手机", "无线耳机", "平板电脑", "智能手表", "蓝牙音箱", "机械键盘", "电竞鼠标", "4K显示器", "固态硬盘", "移动电源", "空气净化器", "扫地机器人", "电饭煲", "微波炉", "电烤箱", "咖啡机", "榨汁机", "吸尘器", "吹风机", "电动牙刷", "跑步机", "瑜伽垫", "羽毛球拍", "篮球", "足球", "游泳镜", "登山包", "帐篷", "睡袋", "野餐垫"}
	colors         = []string{"红色", "橙色", "黄色", "绿色", "青色", "蓝色", "紫色", "粉色", "棕色", "黑色", "白色", "灰色", "银色", "金色", "米色", "天蓝色", "深蓝色", "草绿色", "墨绿色", "酒红色", "玫红色", "土黄色", "藏青色", "象牙白", "香槟金", "玫瑰金", "太空灰", "珍珠白", "曜石黑", "琥珀色"}
	orderStatuses  = []string{"待付款", "已付款", "待发货", "已发货", "运输中", "已签收", "已完成", "已取消", "已退款", "售后中"}
	payMethods     = []string{"支付宝", "微信支付", "银联卡", "信用卡", "花呗", "京东白条", "Apple Pay", "PayPal"}

	urlDomains  = []string{"example.com", "demo.net", "test.org", "sample.io", "mock.dev", "fake.app", "placeholder.cn"}
	urlPaths    = []string{"/home", "/about", "/products", "/services", "/contact", "/blog", "/news", "/help", "/faq", "/support", "/api/v1", "/api/v2", "/dashboard", "/profile", "/settings", "/search", "/cart", "/checkout", "/orders", "/invoices"}
	loremWords  = []string{"我们", "公司", "致力于", "提供", "高质量", "产品", "和", "服务", "客户", "满意", "是", "我们", "追求", "目标", "通过", "不断", "创新", "优化", "流程", "提升", "效率", "专业", "团队", "拥有", "丰富", "经验", "能够", "快速", "响应", "需求", "解决方案", "覆盖", "多个", "行业", "领域", "技术", "领先", "市场", "获得", "广泛", "认可"}
	productDesc = []string{"这款产品采用先进技术，具有出色的性能和可靠性。", "经过精心设计，外观时尚，功能强大，深受用户喜爱。", "采用环保材料，节能高效，是您的理想选择。", "品质卓越，经久耐用，为您提供最佳使用体验。", "集多种功能于一体，操作简便，适合各种场景。", "创新设计，突破传统，引领行业新潮流。", "高性价比，售后无忧，让您买得放心，用得舒心。", "专业品质，细节精致，彰显不凡品味。", "智能互联，高效便捷，让生活更美好。", "严格质检，安全可靠，值得信赖的优选品牌。"}
)

/* ── 种子初始化 ── */
func init() {
	rand.Seed(time.Now().UnixNano())
}

/* ── 公开：根据 fakeType 生成值 ── */

func generateFakeValueByType(fakeType string, seed int, fieldType string) any {
	ft := strings.ToLower(fakeType)
	if ft == "" || ft == "auto" {
		return generateFakeValue(fieldType, seed)
	}

	var result any
	switch ft {
	/* 基础数值 */
	case "integer":
		result = seed + rand.Intn(10000) + 1
	case "decimal":
		result = fmt.Sprintf("%.2f", rand.Float64()*10000)
	case "boolean":
		result = rand.Intn(2) == 0
	case "age":
		result = 18 + rand.Intn(63)
	case "price":
		result = fmt.Sprintf("%.2f", rand.Float64()*999+1)
	case "stock":
		result = rand.Intn(10000)
	case "rating":
		result = 1 + rand.Intn(5)
	case "percentage":
		result = fmt.Sprintf("%.1f%%", rand.Float64()*100)

	/* 姓名 */
	case "chinese_name":
		result = chineseSurnames[rand.Intn(len(chineseSurnames))] + chineseNames[rand.Intn(len(chineseNames))]
	case "english_name":
		result = englishFirstNames[rand.Intn(len(englishFirstNames))] + " " + englishLastNames[rand.Intn(len(englishLastNames))]

	/* 联系信息 */
	case "email":
		result = fmt.Sprintf("%s_%d@%s", randomLowerString(6), seed, emailDomains[rand.Intn(len(emailDomains))])
	case "mobile":
		result = randomMobile()
	case "phone":
		result = randomPhone()
	case "id_card":
		result = randomIDCard()

	/* 地址与公司 */
	case "address":
		result = randomAddress()
	case "company":
		result = companyPrefixes[rand.Intn(len(companyPrefixes))] + companySuffixes[rand.Intn(len(companySuffixes))]
	case "job_title":
		result = jobTitles[rand.Intn(len(jobTitles))]

	/* 文本与描述 */
	case "description":
		result = productDesc[rand.Intn(len(productDesc))]
	case "lorem_text":
		result = randomLorem(10 + rand.Intn(30))
	case "product_name":
		result = productNames[rand.Intn(len(productNames))]
	case "color":
		result = colors[rand.Intn(len(colors))]

	/* 网络相关 */
	case "url":
		result = fmt.Sprintf("https://www.%s%s", urlDomains[rand.Intn(len(urlDomains))], urlPaths[rand.Intn(len(urlPaths))])
	case "ip_address":
		result = fmt.Sprintf("%d.%d.%d.%d", 10+rand.Intn(240), rand.Intn(256), rand.Intn(256), rand.Intn(256))
	case "uuid":
		result = randomUUID()

	/* 业务标识 */
	case "order_sn":
		result = fmt.Sprintf("ORD%s%06d", time.Now().Format("20060102"), seed+1)
	case "trade_no":
		result = fmt.Sprintf("T%s%010d", time.Now().Format("20060102150405"), seed+1)
	case "serial_no":
		result = fmt.Sprintf("SN%04d-%04d-%04d", rand.Intn(10000), rand.Intn(10000), seed+1)

	/* 时间 */
	case "date":
		result = time.Now().AddDate(0, 0, rand.Intn(730)-365).Format("2006-01-02")
	case "datetime":
		result = time.Now().Add(time.Duration(rand.Intn(63072000)-31536000) * time.Second).Format("2006-01-02 15:04:05")
	case "time":
		result = fmt.Sprintf("%02d:%02d:%02d", rand.Intn(24), rand.Intn(60), rand.Intn(60))
	case "year":
		result = 1990 + rand.Intn(35)
	case "timestamp":
		result = time.Now().Add(time.Duration(rand.Intn(63072000)-31536000) * time.Second).Unix()

	/* 枚举 */
	case "yes_no":
		if rand.Intn(2) == 0 {
			result = "Y"
		} else {
			result = "N"
		}
	case "gender":
		if rand.Intn(2) == 0 {
			result = "男"
		} else {
			result = "女"
		}
	case "status":
		statuses := []string{"启用", "禁用", "待审核", "已删除", "已归档"}
		result = statuses[rand.Intn(len(statuses))]
	case "order_status":
		result = orderStatuses[rand.Intn(len(orderStatuses))]
	case "pay_method":
		result = payMethods[rand.Intn(len(payMethods))]

	/* 默认回退 */
	default:
		result = generateFakeValue(fieldType, seed)
	}

	/* 根据真实字段类型做最终适配，防止溢出或超长 */
	return adaptValueToFieldType(result, fieldType)
}

/* ── 字段类型元数据解析 ── */

type fieldMeta struct {
	kind      string // 去除长度后的基础类型
	length    int    // char/varchar 长度
	precision int    // decimal 总位数
	scale     int    // decimal 小数位
}

func parseFieldMeta(fieldType string) fieldMeta {
	ft := strings.ToLower(strings.TrimSpace(fieldType))
	meta := fieldMeta{kind: ft}

	if idx := strings.Index(ft, "("); idx != -1 && strings.HasSuffix(ft, ")") {
		inside := ft[idx+1 : len(ft)-1]
		if strings.Contains(inside, ",") {
			parts := strings.Split(inside, ",")
			if len(parts) == 2 {
				meta.precision, _ = strconv.Atoi(strings.TrimSpace(parts[0]))
				meta.scale, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
			}
		} else {
			meta.length, _ = strconv.Atoi(strings.TrimSpace(inside))
		}
		meta.kind = ft[:idx]
	}

	// 规范化别名
	switch meta.kind {
	case "integer":
		meta.kind = "int"
	case "numeric":
		meta.kind = "decimal"
	}

	return meta
}

/* ── 自动识别模式：按字段类型生成基础值 ── */

func generateFakeValue(fieldType string, seed int) any {
	meta := parseFieldMeta(fieldType)

	switch meta.kind {
	case "tinyint":
		return seed % 10
	case "smallint":
		return seed % 1000
	case "mediumint":
		return seed % 100000
	case "int", "bigint":
		return seed + 1
	case "float", "double", "real":
		return float64(seed) + 0.5
	case "decimal":
		val := float64(seed) + 0.5
		return formatDecimalByFieldType(val, fieldType)
	case "bool", "boolean":
		return seed%2 == 0
	case "datetime", "timestamp":
		return time.Now().Add(time.Duration(seed) * time.Second).Format("2006-01-02 15:04:05")
	case "date":
		return time.Now().Add(time.Duration(seed) * time.Hour * 24).Format("2006-01-02")
	case "time":
		return time.Now().Add(time.Duration(seed) * time.Second).Format("15:04:05")
	case "year":
		return 1990 + seed%35
	case "char", "varchar", "nchar", "nvarchar":
		val := fmt.Sprintf("val_%x", seed+1)
		return clampStringByFieldType(val, fieldType)
	case "tinytext", "text", "mediumtext", "longtext":
		return fmt.Sprintf("val_%x", seed+1)
	case "json":
		return `{"key":"value"}`
	case "blob", "tinyblob", "mediumblob", "longblob", "binary", "varbinary":
		return []byte(fmt.Sprintf("bin_%x", seed+1))
	case "bit":
		return seed % 2
	default:
		return fmt.Sprintf("val_%x", seed+1)
	}
}

/* ── 值适配层：确保不超出字段限制 ── */

func adaptValueToFieldType(value any, fieldType string) any {
	switch v := value.(type) {
	case int:
		return clampIntByFieldType(v, fieldType)
	case float64:
		meta := parseFieldMeta(fieldType)
		if meta.kind == "decimal" || meta.kind == "numeric" || meta.kind == "float" || meta.kind == "double" || meta.kind == "real" {
			return formatDecimalByFieldType(v, fieldType)
		}
		if meta.kind == "tinyint" {
			return int(v) % 10
		}
		if meta.kind == "smallint" {
			return int(v) % 32768
		}
		if meta.kind == "mediumint" {
			return int(v) % 8388608
		}
		return v
	case string:
		return clampStringByFieldType(v, fieldType)
	case []byte:
		s := string(v)
		clamped := clampStringByFieldType(s, fieldType)
		return []byte(clamped)
	default:
		return value
	}
}

func clampIntByFieldType(v int, fieldType string) int {
	meta := parseFieldMeta(fieldType)
	switch meta.kind {
	case "tinyint":
		if v < 0 {
			return 0
		}
		return v % 10
	case "smallint":
		if v > 32767 {
			return v % 32768
		}
		return v
	case "mediumint":
		if v > 8388607 {
			return v % 8388608
		}
		return v
	case "int", "bigint":
		return v
	default:
		return v
	}
}

func clampStringByFieldType(s string, fieldType string) string {
	meta := parseFieldMeta(fieldType)
	switch meta.kind {
	case "char", "varchar", "nchar", "nvarchar":
		if meta.length > 0 && len(s) > meta.length {
			if meta.length <= 5 {
				// 极短字段：生成有意义的短字符序列
				letters := "abcdefghijklmnopqrstuvwxyz0123456789"
				var sb strings.Builder
				for i := 0; i < meta.length; i++ {
					sb.WriteByte(letters[(len(s)+i)%len(letters)])
				}
				return sb.String()
			}
			return s[:meta.length]
		}
	case "tinytext":
		if len(s) > 255 {
			return s[:255]
		}
	case "text":
		if len(s) > 65535 {
			return s[:65535]
		}
	}
	return s
}

func formatDecimalByFieldType(v float64, fieldType string) string {
	meta := parseFieldMeta(fieldType)
	if meta.kind == "decimal" || meta.kind == "numeric" {
		if meta.scale > 0 && meta.precision > 0 {
			format := fmt.Sprintf("%%.%df", meta.scale)
			s := fmt.Sprintf(format, v)
			// 粗略保证总长度不超 precision + 1（小数点）
			maxLen := meta.precision + 1
			if meta.scale > 0 {
				maxLen++
			}
			if len(s) > maxLen {
				parts := strings.Split(s, ".")
				if len(parts) == 2 {
					intPart := parts[0]
					fracPart := parts[1]
					avail := meta.precision - meta.scale
					if len(intPart) > avail {
						intPart = intPart[len(intPart)-avail:]
					}
					s = intPart + "." + fracPart
				}
			}
			return s
		}
	}
	return fmt.Sprintf("%.2f", v)
}

/* ── 辅助函数 ── */

func randomMobile() string {
	prefixes := []string{"138", "139", "137", "136", "135", "134", "150", "151", "152", "157", "158", "159", "182", "183", "184", "187", "188", "147", "178", "130", "131", "132", "155", "156", "185", "186", "145", "176", "133", "153", "180", "181", "189", "177", "173", "199", "166", "198"}
	p := prefixes[rand.Intn(len(prefixes))]
	return fmt.Sprintf("%s%04d%04d", p, rand.Intn(10000), rand.Intn(10000))
}

func randomPhone() string {
	areaCodes := []string{"010", "021", "022", "023", "024", "025", "027", "028", "029", "020", "0755", "0571", "0512", "0531", "0371", "027", "0731", "0591"}
	ac := areaCodes[rand.Intn(len(areaCodes))]
	return fmt.Sprintf("%s-%d%07d", ac, 2+rand.Intn(7), rand.Intn(10000000))
}

func randomIDCard() string {
	areas := []string{"110101", "310101", "440106", "330106", "320106", "510107", "370102", "410105", "420106", "430103"}
	area := areas[rand.Intn(len(areas))]
	year := 1970 + rand.Intn(40)
	month := 1 + rand.Intn(12)
	day := 1 + rand.Intn(28)
	seq := rand.Intn(1000)
	return fmt.Sprintf("%s%d%02d%02d%03d", area, year, month, day, seq)
}

func randomAddress() string {
	return fmt.Sprintf("%s%s%s%d号%d室",
		provinces[rand.Intn(len(provinces))],
		cities[rand.Intn(len(cities))],
		streetNames[rand.Intn(len(streetNames))],
		1+rand.Intn(999),
		1+rand.Intn(30))
}

func randomLorem(n int) string {
	var sb strings.Builder
	for i := 0; i < n; i++ {
		if i > 0 {
			sb.WriteString(" ")
		}
		sb.WriteString(loremWords[rand.Intn(len(loremWords))])
	}
	return sb.String()
}

func randomLowerString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

func randomUUID() string {
	const hex = "0123456789abcdef"
	parts := []int{8, 4, 4, 4, 12}
	var sb strings.Builder
	for i, l := range parts {
		if i > 0 {
			sb.WriteByte('-')
		}
		for j := 0; j < l; j++ {
			sb.WriteByte(hex[rand.Intn(len(hex))])
		}
	}
	return sb.String()
}
