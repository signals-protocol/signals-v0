// tests/_bootstrap.ts (AssemblyScript)
import {
  beforeAll,
  beforeEach,
  dataSourceMock,
  clearStore,
} from "matchstick-as/assembly/index";

beforeAll((): void => {
  dataSourceMock.resetValues();
  // ⚠️ 테스트 전체에서 공통으로 쓸 가짜 주소 1번만 지정하면 경고 사라짐
  dataSourceMock.setAddress("0x971f9bce130743bb3efb37aeac2050cd44d7579a");
  // (선택) 네트워크 지정이 필요하면 아래처럼
  // dataSourceMock.setNetwork("citrea-testnet");
});

beforeEach((): void => {
  // 테스트 간 상태 간섭 방지
  clearStore();
});
