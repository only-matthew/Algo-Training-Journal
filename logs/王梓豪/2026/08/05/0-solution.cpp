#include<iostream>
#include<vector>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        vector<int> v(3);
        for (size_t i = 0; i < 3; i++)
        {
            cin>>v[i];
        }
        sort(v.begin(),v.end());
        int ans=0;
        while(v[0]!=v[1]&&v[1]!=v[2]&&v[0]!=v[2])
        {
            v[0]++;
            v[2]--;
            ans++;
        }
        cout<<ans<<endl;
    }
}