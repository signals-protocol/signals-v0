#!/bin/bash

# ========================================
# CLMSR Market System - Advanced Codebase Compiler
# ========================================
# 
# 이 스크립트는 프로젝트의 모든 파일을 자동으로 탐지하고
# 완전한 문서를 생성합니다. 파일 추가/변경 시 수동 수정 불필요!
#
# 특징:
# - 자동 파일 탐지 및 분류
# - 동적 디렉토리 구조 시각화
# - 실시간 테스트 결과 포함
# - 프로젝트 통계 자동 계산
# - 모든 파일 내용 포함
# - 아름다운 마크다운 포맷팅
# ========================================

set -e  # 에러 발생 시 즉시 종료

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 설정
OUTPUT_FILE="complete_codebase.md"
TEMP_DIR=".temp_combine"
TEST_OUTPUT_FILE="$TEMP_DIR/test_results.txt"

# 유틸리티 함수들
print_header() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

print_step() {
    echo -e "${GREEN}📋 $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# 임시 디렉토리 생성
mkdir -p "$TEMP_DIR"

# 파일 확장자에 따른 언어 감지
get_language() {
    case "$1" in
        *.sol) echo "solidity" ;;
        *.ts) echo "typescript" ;;
        *.js) echo "javascript" ;;
        *.json) echo "json" ;;
        *.md) echo "markdown" ;;
        *.sh) echo "bash" ;;
        *.yml|*.yaml) echo "yaml" ;;
        *.toml) echo "toml" ;;
        *) echo "text" ;;
    esac
}

# 파일 크기를 사람이 읽기 쉬운 형태로 변환
human_readable_size() {
    local size=$1
    if [ $size -lt 1024 ]; then
        echo "${size}B"
    elif [ $size -lt 1048576 ]; then
        echo "$((size / 1024))KB"
    else
        echo "$((size / 1048576))MB"
    fi
}

# 디렉토리 구조를 트리 형태로 생성
generate_tree_structure() {
    print_step "Generating directory tree structure..."
    
    echo "## 📁 Project Directory Structure" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo "\`\`\`" >> "$OUTPUT_FILE"
    
    # tree 명령어가 있으면 사용, 없으면 find로 대체
    if command -v tree >/dev/null 2>&1; then
        tree -I 'node_modules|.git|cache|artifacts|typechain-types|coverage|.cursor|complete_codebase.md' >> "$OUTPUT_FILE"
    else
        # 제대로 된 트리 구조 생성
        echo "signals-v0/" >> "$OUTPUT_FILE"
        echo "├── contracts/" >> "$OUTPUT_FILE"
        if [ -d "contracts" ]; then
            for dir in contracts/*/; do
                if [ -d "$dir" ]; then
                    dir_name=$(basename "$dir")
                    echo "│   ├── $dir_name/" >> "$OUTPUT_FILE"
                    for file in "$dir"*.sol; do
                        if [ -f "$file" ]; then
                            file_name=$(basename "$file")
                            echo "│   │   └── $file_name" >> "$OUTPUT_FILE"
                        fi
                    done
                fi
            done
        fi
        echo "├── test/" >> "$OUTPUT_FILE"
        if [ -d "test" ]; then
            for dir in test/*/; do
                if [ -d "$dir" ]; then
                    dir_name=$(basename "$dir")
                    echo "│   ├── $dir_name/" >> "$OUTPUT_FILE"
                    find "$dir" -name "*.ts" | while read file; do
                        rel_path=${file#test/$dir_name/}
                        echo "│   │   └── $rel_path" >> "$OUTPUT_FILE"
                    done
                fi
            done
        fi
        echo "├── package.json" >> "$OUTPUT_FILE"
        echo "├── hardhat.config.ts" >> "$OUTPUT_FILE"
        echo "├── tsconfig.json" >> "$OUTPUT_FILE"
        echo "├── README.md" >> "$OUTPUT_FILE"
        echo "└── .gitignore" >> "$OUTPUT_FILE"
    fi
    
    echo "\`\`\`" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
}

# 파일을 출력에 추가하는 함수
add_file() {
    local file_path="$1"
    local category="$2"
    local file_name=$(basename "$file_path")
    
    if [ -f "$file_path" ]; then
        local file_size=$(wc -c < "$file_path")
        local line_count=$(wc -l < "$file_path")
        local readable_size=$(human_readable_size $file_size)
        
        echo "  📄 Adding: $file_path ($readable_size, $line_count lines)"
        
        # 목차에 추가
        local anchor=$(echo "$file_path" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]')
        echo "- [$file_path](#$anchor) ($readable_size, $line_count lines)" >> "$OUTPUT_FILE"
        
        # 통계 업데이트
        total_files=$((total_files + 1))
        total_size=$((total_size + file_size))
        total_lines=$((total_lines + line_count))
        
        # 카테고리별 통계
        case "$category" in
            "Core Contracts") core_files=$((core_files + 1)) ;;
            "Interface Contracts") interface_files=$((interface_files + 1)) ;;
            "Library Contracts") library_files=$((library_files + 1)) ;;
            "Error Contracts") error_files=$((error_files + 1)) ;;
            "Manager Contracts") manager_files=$((manager_files + 1)) ;;
            "Periphery Contracts") periphery_files=$((periphery_files + 1)) ;;
            "Test Contracts") test_contract_files=$((test_contract_files + 1)) ;;
            "Mock Contracts") mock_files=$((mock_files + 1)) ;;
            "TypeScript Tests") test_files=$((test_files + 1)) ;;
            "Configuration") config_files=$((config_files + 1)) ;;
        esac
    else
        print_warning "File not found: $file_path"
    fi
}

# 파일 내용을 실제로 추가하는 함수
add_file_content() {
    local file_path="$1"
    local category="$2"
    local file_name=$(basename "$file_path")
    
    if [ -f "$file_path" ]; then
        local file_size=$(wc -c < "$file_path")
        local line_count=$(wc -l < "$file_path")
        local readable_size=$(human_readable_size $file_size)
        
        echo "  📄 Adding content: $file_path ($readable_size, $line_count lines)"
        
        # 파일 내용 추가
        echo "" >> "$OUTPUT_FILE"
        echo "## $file_path" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "_Category: $category | Size: $readable_size | Lines: $line_count_" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "\`\`\`$(get_language "$file_path")" >> "$OUTPUT_FILE"
        cat "$file_path" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
        echo "\`\`\`" >> "$OUTPUT_FILE"
        echo "" >> "$OUTPUT_FILE"
    else
        print_warning "File not found: $file_path"
    fi
}

# 디렉토리의 모든 파일을 재귀적으로 추가
add_directory() {
    local dir_path="$1"
    local category="$2"
    local pattern="$3"
    
    if [ -d "$dir_path" ]; then
        print_step "Scanning directory: $dir_path"
        for file in $(find "$dir_path" -name "$pattern" -type f | sort); do
            add_file "$file" "$category"
        done
    else
        print_warning "Directory not found: $dir_path"
    fi
}

# 디렉토리의 모든 파일 내용을 실제로 추가
add_directory_content() {
    local dir_path="$1"
    local category="$2"
    local pattern="$3"
    
    if [ -d "$dir_path" ]; then
        print_step "Adding content from directory: $dir_path"
        for file in $(find "$dir_path" -name "$pattern" -type f | sort); do
            add_file_content "$file" "$category"
        done
    else
        print_warning "Directory not found: $dir_path"
    fi
}

# 파일 수집 함수 (통계 계산용)
collect_files() {
    print_header "Collecting Files for Statistics"
    
    # 동적으로 contracts 하위 디렉토리들을 탐지하고 추가
    if [ -d "contracts" ]; then
        for contract_dir in contracts/*/; do
            if [ -d "$contract_dir" ]; then
                dir_name=$(basename "$contract_dir")
                case "$dir_name" in
                    "core") add_directory "$contract_dir" "Core Contracts" "*.sol" ;;
                    "interfaces") add_directory "$contract_dir" "Interface Contracts" "*.sol" ;;
                    "libraries") add_directory "$contract_dir" "Library Contracts" "*.sol" ;;
                    "errors") add_directory "$contract_dir" "Error Contracts" "*.sol" ;;
                    "manager") add_directory "$contract_dir" "Manager Contracts" "*.sol" ;;
                    "periphery") add_directory "$contract_dir" "Periphery Contracts" "*.sol" ;;
                    "test") add_directory "$contract_dir" "Test Contracts" "*.sol" ;;
                    "mocks") add_directory "$contract_dir" "Mock Contracts" "*.sol" ;;
                    *) add_directory "$contract_dir" "Other Contracts" "*.sol" ;;
                esac
            fi
        done
    fi
    
    # 동적으로 test 하위 디렉토리들을 탐지하고 추가
    if [ -d "test" ]; then
        for test_dir in test/*/; do
            if [ -d "$test_dir" ]; then
                dir_name=$(basename "$test_dir")
                print_step "Processing test directory: $dir_name"
                add_directory "$test_dir" "TypeScript Tests" "*.ts"
            fi
        done
    fi
    
    # 루트 레벨의 테스트 파일들도 확인
    for test_file in test/*.ts; do
        if [ -f "$test_file" ]; then
            add_file "$test_file" "TypeScript Tests"
        fi
    done
    
    # 동적으로 설정 파일들을 탐지
    for config_file in *.ts *.json *.md *.yml *.yaml *.toml *.sh *.gitignore; do
        if [ -f "$config_file" ] && [ "$config_file" != "$OUTPUT_FILE" ]; then
            # 특정 파일들은 제외
            case "$config_file" in
                "combine_all_files.sh") continue ;;
                *) add_file "$config_file" "Configuration" ;;
            esac
        fi
    done
}

# 모든 파일 내용 추가 함수
add_all_file_contents() {
    print_header "Adding All File Contents"
    
    # 동적으로 contracts 하위 디렉토리들을 탐지하고 내용 추가
    if [ -d "contracts" ]; then
        for contract_dir in contracts/*/; do
            if [ -d "$contract_dir" ]; then
                dir_name=$(basename "$contract_dir")
                case "$dir_name" in
                    "core") add_directory_content "$contract_dir" "Core Contracts" "*.sol" ;;
                    "interfaces") add_directory_content "$contract_dir" "Interface Contracts" "*.sol" ;;
                    "libraries") add_directory_content "$contract_dir" "Library Contracts" "*.sol" ;;
                    "errors") add_directory_content "$contract_dir" "Error Contracts" "*.sol" ;;
                    "manager") add_directory_content "$contract_dir" "Manager Contracts" "*.sol" ;;
                    "periphery") add_directory_content "$contract_dir" "Periphery Contracts" "*.sol" ;;
                    "test") add_directory_content "$contract_dir" "Test Contracts" "*.sol" ;;
                    "mocks") add_directory_content "$contract_dir" "Mock Contracts" "*.sol" ;;
                    *) add_directory_content "$contract_dir" "Other Contracts" "*.sol" ;;
                esac
            fi
        done
    fi
    
    # 동적으로 test 하위 디렉토리들을 탐지하고 내용 추가
    if [ -d "test" ]; then
        for test_dir in test/*/; do
            if [ -d "$test_dir" ]; then
                dir_name=$(basename "$test_dir")
                print_step "Adding content from test directory: $dir_name"
                add_directory_content "$test_dir" "TypeScript Tests" "*.ts"
            fi
        done
    fi
    
    # 루트 레벨의 테스트 파일들도 확인
    for test_file in test/*.ts; do
        if [ -f "$test_file" ]; then
            add_file_content "$test_file" "TypeScript Tests"
        fi
    done
    
    # 동적으로 설정 파일들을 탐지하고 내용 추가
    for config_file in *.ts *.json *.md *.yml *.yaml *.toml *.sh *.gitignore; do
        if [ -f "$config_file" ] && [ "$config_file" != "$OUTPUT_FILE" ]; then
            # 특정 파일들은 제외
            case "$config_file" in
                "combine_all_files.sh") continue ;;
                *) add_file_content "$config_file" "Configuration" ;;
            esac
        fi
    done
}

# 테스트 실행 및 결과 수집
run_tests() {
    print_step "Running test suite to collect current results..."
    
    if command -v npm >/dev/null 2>&1; then
        # 테스트 실행 및 결과 저장
        if npm test > "$TEST_OUTPUT_FILE" 2>&1; then
            test_status="✅ PASSING"
            test_count=$(grep -o "[0-9]\+ passing" "$TEST_OUTPUT_FILE" | head -1 | grep -o "[0-9]\+" || echo "0")
            test_time=$(grep -o "([0-9]\+[ms|s])" "$TEST_OUTPUT_FILE" | tail -1 || echo "")
            if [ -z "$test_count" ] || [ "$test_count" = "0" ]; then
                test_count="Unknown"
            fi
        else
            test_status="❌ FAILING"
            test_count=$(grep -o "[0-9]\+ passing" "$TEST_OUTPUT_FILE" | head -1 | grep -o "[0-9]\+" || echo "0")
            failing_count=$(grep -o "[0-9]\+ failing" "$TEST_OUTPUT_FILE" | head -1 | grep -o "[0-9]\+" || echo "0")
            test_time=""
        fi
    else
        print_warning "npm not found, skipping test execution"
        test_status="⚠️ SKIPPED"
        test_count="N/A"
        test_time=""
    fi
}

# 프로젝트 통계 계산
calculate_stats() {
    print_step "Calculating project statistics..."
    
    # Git 통계 (가능한 경우)
    if command -v git >/dev/null 2>&1 && [ -d ".git" ]; then
        commit_count=$(git rev-list --count HEAD 2>/dev/null || echo "N/A")
        last_commit=$(git log -1 --format="%h - %s (%cr)" 2>/dev/null || echo "N/A")
        contributors=$(git shortlog -sn | wc -l 2>/dev/null || echo "N/A")
    else
        commit_count="N/A"
        last_commit="N/A"
        contributors="N/A"
    fi
}

# 메인 문서 헤더 생성
generate_header() {
    cat > "$OUTPUT_FILE" << EOF
# 🚀 CLMSR Market System - Complete Codebase

_Auto-generated comprehensive documentation with live test results_

---

## 📊 Project Overview

| Metric | Value |
|--------|-------|
| **Generated** | $(date '+%Y-%m-%d %H:%M:%S %Z') |
| **Test Status** | $test_status |
| **Total Tests** | $test_count tests $test_time |
| **Total Files** | $total_files files |
| **Total Size** | $(human_readable_size $total_size) |
| **Total Lines** | $total_lines lines |
| **Git Commits** | $commit_count |
| **Contributors** | $contributors |

---

## 🎯 Latest Test Results

EOF

    # 테스트 결과 요약 추가
    if [ -f "$TEST_OUTPUT_FILE" ]; then
        echo "\`\`\`" >> "$OUTPUT_FILE"
        tail -20 "$TEST_OUTPUT_FILE" >> "$OUTPUT_FILE"
        echo "\`\`\`" >> "$OUTPUT_FILE"
    fi

    echo "" >> "$OUTPUT_FILE"
    echo "---" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
}

# 파일 구조 통계 생성
generate_file_statistics() {
    cat >> "$OUTPUT_FILE" << EOF

## 📁 File Structure & Statistics

| Category | Files | Description |
|----------|-------|-------------|
| **Core Contracts** | $core_files | Main CLMSR implementation |
| **Interface Contracts** | $interface_files | Contract interfaces |
| **Library Contracts** | $library_files | Mathematical libraries |
| **Error Contracts** | $error_files | Custom error definitions |
| **Manager Contracts** | $manager_files | Management layer contracts |
| **Periphery Contracts** | $periphery_files | Helper and utility contracts |
| **Test Contracts** | $test_contract_files | Solidity test helpers |
| **Mock Contracts** | $mock_files | Testing mocks |
| **TypeScript Tests** | $test_files | Comprehensive test suite |
| **Configuration** | $config_files | Build & deployment config |

---

## 📋 Table of Contents

EOF
}

# 메인 실행 함수
main() {
    print_header "CLMSR Market System - Advanced Codebase Compiler"
    
    # 통계 변수 초기화
    total_files=0
    total_size=0
    total_lines=0
    core_files=0
    interface_files=0
    library_files=0
    error_files=0
    manager_files=0
    periphery_files=0
    test_contract_files=0
    mock_files=0
    test_files=0
    config_files=0
    
    # 1. 테스트 실행
    run_tests
    
    # 2. 프로젝트 통계 계산
    calculate_stats
    
    # 3. 파일들을 카테고리별로 수집 (통계만)
    collect_files
    
    # 4. 문서 헤더 생성 (통계 포함)
    generate_header
    
    # 5. 디렉토리 구조 생성
    generate_tree_structure
    
    # 6. 파일 구조 통계 생성
    generate_file_statistics
    
    # 7. 모든 파일 내용 추가
    add_all_file_contents
    
    # 8. 문서 푸터 생성
    print_step "Generating document footer"
    
    cat >> "$OUTPUT_FILE" << EOF

---

## 📈 Project Statistics

### 📊 Codebase Metrics
- **Total Files**: $total_files
- **Total Size**: $(human_readable_size $total_size)
- **Total Lines**: $total_lines
EOF

    if [ $total_files -gt 0 ]; then
        echo "- **Average File Size**: $(human_readable_size $((total_size / total_files)))" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << EOF

### 🧪 Test Coverage
- **Test Status**: $test_status
- **Total Tests**: $test_count
- **Test Files**: $test_files
- **Test Contracts**: $test_contract_files

### 🏗️ Architecture
- **Core Contracts**: $core_files (Immutable business logic)
- **Interface Contracts**: $interface_files (Type definitions)
- **Library Contracts**: $library_files (Mathematical utilities)
- **Error Contracts**: $error_files (Custom error definitions)
- **Manager Contracts**: $manager_files (Management layer)
- **Periphery Contracts**: $periphery_files (Helper utilities)
- **Mock Contracts**: $mock_files (Testing infrastructure)

---

## 🚀 Key Features Implemented

### 🎯 Core Functionality
1. **CLMSR Market System**: Complete implementation with chunk-split handling
2. **Position Management**: NFT-based position tracking with full lifecycle
3. **Mathematical Libraries**: Robust fixed-point arithmetic and segment trees
4. **Security Hardening**: Protection against common DeFi vulnerabilities

### 🧪 Testing Excellence
1. **Comprehensive Coverage**: $test_count tests covering all scenarios
2. **Multi-layer Testing**: Unit, Integration, Component, E2E, and Performance tests
3. **Security Testing**: Attack vector validation
4. **Invariant Testing**: Mathematical property verification

---

## 📝 Development Information

### 🔧 Build Information
- **Generated**: $(date '+%Y-%m-%d %H:%M:%S %Z')
- **Generator**: Advanced Codebase Compiler v3.1
- **Git Commits**: $commit_count
- **Last Commit**: $last_commit

### 🎯 Project Status
EOF

    if [ "$test_status" = "✅ PASSING" ]; then
        echo "✅ **All Tests Passing** - Ready for deployment" >> "$OUTPUT_FILE"
    else
        echo "⚠️ **Tests Need Attention** - Check test output for details" >> "$OUTPUT_FILE"
    fi

    cat >> "$OUTPUT_FILE" << EOF

---

## 🏆 Achievement Summary

✅ **$test_count Tests** - Comprehensive test coverage  
✅ **Multi-layer Architecture** - Clean separation of concerns  
✅ **Complete Codebase** - All files with full content included  
✅ **Production Ready** - Comprehensive documentation and testing  

---

_This documentation was automatically generated by the CLMSR Advanced Codebase Compiler._  
_For the latest version, run: \`./combine_all_files.sh\`_

EOF
    
    # 9. 정리
    rm -rf "$TEMP_DIR"
    
    # 10. 결과 출력
    print_header "Compilation Complete!"
    
    echo ""
    print_success "📄 Output file: $OUTPUT_FILE"
    print_success "📊 Total files processed: $total_files"
    print_success "💾 Total size: $(human_readable_size $total_size)"
    print_success "📝 Total lines: $total_lines"
    print_success "🧪 Test status: $test_status ($test_count tests)"
    echo ""
    
    if [ "$test_status" = "✅ PASSING" ]; then
        print_success "🎉 All tests passing! Ready for deployment!"
    else
        print_warning "⚠️  Some tests may be failing. Check test output for details."
    fi
    
    echo ""
    print_header "🚀 CLMSR Market System Documentation Ready!"
}

# 스크립트 실행
main "$@" 