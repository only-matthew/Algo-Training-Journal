#include <iostream>
#include <string>
using namespace std;
int main() {
	ios::sync_with_stdio(false);
	cin.tie(nullptr);
	int t;
	cin >> t;
	while (t--) {
		int n;
		string a, b;
		cin >> n >> a >> b;
		int balance[2] = {};
		for (int i = 0; i < n; i++)
			balance[i % 2] += (a[i] == '1') - (b[i] == '1');
		cout << (balance[0] == 0 && balance[1] == 0 ? "YES" : "NO") << '\n';
	}
	return 0;
}